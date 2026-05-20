/**
 * Phone test logic for dashboard API — Twilio when configured, mock otherwise.
 */
import twilio from 'twilio';

const TWILIO_REQUIRED = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER'];

const mapTwilioStatus = (status) => {
  const normalized = String(status || '').toLowerCase();
  if (['queued', 'initiated', 'ringing'].includes(normalized)) return 'call_started';
  if (normalized === 'in-progress') return 'call_answered';
  if (normalized === 'busy') return 'busy';
  if (normalized === 'no-answer') return 'no_answer';
  if (normalized === 'failed' || normalized === 'canceled') return 'call_failed';
  if (normalized === 'completed') return 'call_completed';
  return 'status_unknown';
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isValidE164 = (number) => /^\+[1-9]\d{7,14}$/.test(number);

export const runMockPhoneTest = ({ phoneNumber, testName, expectedOutcome, notes }) => {
  const outcomes = ['call_started', 'call_answered', 'busy', 'no_answer'];
  const mockStatus = outcomes[Math.floor(Math.random() * outcomes.length)];
  const matches =
    !expectedOutcome ||
    mockStatus.includes(expectedOutcome.replace(/\s/g, '_')) ||
    expectedOutcome === 'should ring';

  return {
    mode: 'mock',
    phoneNumber,
    testName: testName || 'Mock phone test',
    expectedOutcome: expectedOutcome || '',
    callStatus: mockStatus,
    notes: notes || '',
    passed: matches,
    status: matches ? 'pass' : 'warn',
    detail: 'Mock mode — Twilio credentials not configured on server.',
    checkedAt: new Date().toISOString()
  };
};

export const runPhoneTest = async ({ phoneNumber, testName, expectedOutcome, notes }, env = process.env) => {
  const missing = TWILIO_REQUIRED.filter((name) => !env[name]);
  if (missing.length) {
    return runMockPhoneTest({ phoneNumber, testName, expectedOutcome, notes });
  }

  if (!isValidE164(phoneNumber)) {
    return {
      mode: 'twilio',
      phoneNumber,
      testName,
      callStatus: 'invalid_number',
      passed: false,
      status: 'fail',
      detail: 'Invalid E.164 format (e.g. +441234567890)',
      checkedAt: new Date().toISOString()
    };
  }

  const client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  const twimlUrl = env.TWILIO_TEST_CALL_TWIML_URL || 'http://demo.twilio.com/docs/voice.xml';
  const timeoutSec = Number(env.TWILIO_CALL_TIMEOUT_SEC || 25);

  try {
    const call = await client.calls.create({
      to: phoneNumber,
      from: env.TWILIO_FROM_NUMBER,
      url: twimlUrl,
      timeout: timeoutSec,
      statusCallback: env.TWILIO_STATUS_CALLBACK_URL || undefined,
      statusCallbackEvent: env.TWILIO_STATUS_CALLBACK_URL ? ['completed'] : undefined
    });

    let mapped = mapTwilioStatus(call.status);
    const maxMs = timeoutSec * 1000;
    const started = Date.now();
    let latest = call;

    while (Date.now() - started <= maxMs) {
      latest = await client.calls(call.sid).fetch();
      mapped = mapTwilioStatus(latest.status);
      if (['call_answered', 'busy', 'no_answer', 'call_failed', 'call_completed'].includes(mapped)) {
        break;
      }
      await sleep(2000);
    }

    return {
      mode: 'twilio',
      phoneNumber,
      testName: testName || 'Outbound test',
      expectedOutcome,
      notes,
      callStatus: mapped,
      twilioSid: call.sid,
      passed: mapped === 'call_answered' || mapped === 'call_completed',
      status: mapped === 'call_answered' || mapped === 'call_completed' ? 'pass' : mapped === 'call_started' ? 'warn' : 'fail',
      detail: `Twilio final status: ${latest.status}`,
      checkedAt: new Date().toISOString()
    };
  } catch (error) {
    return {
      mode: 'twilio',
      phoneNumber,
      testName,
      callStatus: 'call_failed',
      passed: false,
      status: 'fail',
      detail: error.message,
      checkedAt: new Date().toISOString()
    };
  }
};

export const getPhoneConfigStatus = (env = process.env) => {
  const missing = TWILIO_REQUIRED.filter((name) => !env[name]);
  return {
    twilioConfigured: missing.length === 0,
    missingKeys: missing,
    mockMode: missing.length > 0
  };
};

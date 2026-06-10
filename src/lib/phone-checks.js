/**
 * Phone test logic for dashboard API — Twilio when configured, mock otherwise.
 */
import twilio from 'twilio';

const TWILIO_REQUIRED = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER'];
const E164_REGEX = /^\+[1-9]\d{7,14}$/;
const DEFAULT_CARRIER = 'Unknown carrier';
const DEFAULT_LINE_TYPE = 'unknown';
const EXPECTED_OUTCOME_RULES = {
  'should ring': ['call_started', 'call_answered', 'call_completed'],
  'should answer': ['call_answered', 'call_completed'],
  'should go to voicemail': ['no_answer', 'call_completed'],
  'should be busy': ['busy'],
  'should fail': ['call_failed'],
  'should not connect': ['no_answer', 'busy', 'call_failed']
};

const MOCK_TWILIO_RESPONSES = [
  {
    twilioStatus: 'completed',
    mappedStatus: 'call_answered',
    carrier: 'MockTel Wireless',
    lineType: 'mobile',
    sid: 'CA_MOCK_COMPLETED',
    note: 'Simulated completed outbound call.'
  },
  {
    twilioStatus: 'busy',
    mappedStatus: 'busy',
    carrier: 'MockTel Business',
    lineType: 'landline',
    sid: 'CA_MOCK_BUSY',
    note: 'Simulated busy line response.'
  },
  {
    twilioStatus: 'no-answer',
    mappedStatus: 'no_answer',
    carrier: 'MockTel Residential',
    lineType: 'voip',
    sid: 'CA_MOCK_NO_ANSWER',
    note: 'Simulated no-answer/voicemail case.'
  },
  {
    twilioStatus: 'queued',
    mappedStatus: 'call_started',
    carrier: 'MockTel Queue',
    lineType: 'mobile',
    sid: 'CA_MOCK_QUEUED',
    note: 'Simulated queued call start.'
  }
];

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

const isValidE164 = (number) => E164_REGEX.test(String(number || '').trim());

const parseExpectedOutcomes = (expectedOutcome) => {
  const key = String(expectedOutcome || '')
    .toLowerCase()
    .trim();
  if (!key) return null;
  return EXPECTED_OUTCOME_RULES[key] || [key.replace(/\s+/g, '_')];
};

const evaluateStatus = (callStatus, expectedOutcome) => {
  const expectedStatuses = parseExpectedOutcomes(expectedOutcome);
  if (!expectedStatuses) {
    return callStatus === 'call_answered' || callStatus === 'call_completed'
      ? 'pass'
      : callStatus === 'call_started'
        ? 'warn'
        : 'fail';
  }
  return expectedStatuses.includes(callStatus) ? 'pass' : 'fail';
};

const normalizeOutput = ({ status, carrier, lineType, notes, raw }) => ({
  status: status || 'warn',
  carrier: carrier || DEFAULT_CARRIER,
  lineType: lineType || DEFAULT_LINE_TYPE,
  notes: String(notes || ''),
  raw: raw || {}
});

const pickMockResponse = (expectedOutcome) => {
  const expectedStatuses = parseExpectedOutcomes(expectedOutcome);
  if (expectedStatuses?.length) {
    const matched = MOCK_TWILIO_RESPONSES.find((item) => expectedStatuses.includes(item.mappedStatus));
    if (matched) return matched;
  }
  return MOCK_TWILIO_RESPONSES[Math.floor(Math.random() * MOCK_TWILIO_RESPONSES.length)];
};

const safeFetchCarrierDetails = async (client, phoneNumber) => {
  try {
    const lookup = await client.lookups.v2.phoneNumbers(phoneNumber).fetch({
      fields: 'line_type_intelligence'
    });
    const intelligence = lookup?.lineTypeIntelligence || {};
    return {
      carrier: intelligence.carrierName || DEFAULT_CARRIER,
      lineType: intelligence.type || DEFAULT_LINE_TYPE
    };
  } catch {
    return { carrier: DEFAULT_CARRIER, lineType: DEFAULT_LINE_TYPE };
  }
};

export const runMockPhoneTest = ({ phoneNumber, testName, expectedOutcome, notes }) => {
  const normalizedNumber = String(phoneNumber || '').trim();
  if (!isValidE164(normalizedNumber)) {
    return normalizeOutput({
      status: 'fail',
      notes: 'Invalid E.164 format (e.g. +441234567890)',
      raw: {
        mode: 'mock',
        phoneNumber: normalizedNumber,
        testName: testName || 'Mock phone test',
        expectedOutcome: expectedOutcome || '',
        userNotes: notes || '',
        callStatus: 'invalid_number',
        reason: 'Phone number failed E.164 validation',
        checkedAt: new Date().toISOString()
      }
    });
  }

  const mock = pickMockResponse(expectedOutcome);
  const status = evaluateStatus(mock.mappedStatus, expectedOutcome);

  return normalizeOutput({
    status,
    carrier: mock.carrier,
    lineType: mock.lineType,
    notes:
      notes ||
      `Mock mode — Twilio credentials not configured on server. ${mock.note}`,
    raw: {
      mode: 'mock',
      phoneNumber: normalizedNumber,
      testName: testName || 'Mock phone test',
      expectedOutcome: expectedOutcome || '',
      userNotes: notes || '',
      callStatus: mock.mappedStatus,
      twilioStatus: mock.twilioStatus,
      twilioSid: mock.sid,
      mockTwilioResponse: mock,
      checkedAt: new Date().toISOString()
    }
  });
};

export const runPhoneTest = async ({ phoneNumber, testName, expectedOutcome, notes }, env = process.env) => {
  const normalizedNumber = String(phoneNumber || '').trim();

  if (!isValidE164(normalizedNumber)) {
    return normalizeOutput({
      status: 'fail',
      notes: 'Invalid E.164 format (e.g. +441234567890)',
      raw: {
        mode: 'validation',
        phoneNumber: normalizedNumber,
        testName,
        expectedOutcome: expectedOutcome || '',
        userNotes: notes || '',
        callStatus: 'invalid_number',
        checkedAt: new Date().toISOString()
      }
    });
  }

  const missing = TWILIO_REQUIRED.filter((name) => !env[name]);
  if (missing.length) {
    return runMockPhoneTest({ phoneNumber: normalizedNumber, testName, expectedOutcome, notes });
  }

  const client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  const twimlUrl = env.TWILIO_TEST_CALL_TWIML_URL || 'http://demo.twilio.com/docs/voice.xml';
  const timeoutSec = Number(env.TWILIO_CALL_TIMEOUT_SEC || 25);

  try {
    const call = await client.calls.create({
      to: normalizedNumber,
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

    const { carrier, lineType } = await safeFetchCarrierDetails(client, normalizedNumber);
    return normalizeOutput({
      status: evaluateStatus(mapped, expectedOutcome),
      carrier,
      lineType,
      notes: notes || `Twilio final status: ${latest.status}`,
      raw: {
        mode: 'twilio',
        phoneNumber: normalizedNumber,
        testName: testName || 'Outbound test',
        expectedOutcome: expectedOutcome || '',
        userNotes: notes || '',
        callStatus: mapped,
        twilioStatus: latest.status,
        twilioSid: call.sid,
        checkedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    return normalizeOutput({
      status: 'fail',
      notes: `Twilio request failed: ${error.message}`,
      raw: {
        mode: 'twilio',
        phoneNumber: normalizedNumber,
        testName,
        expectedOutcome: expectedOutcome || '',
        userNotes: notes || '',
        callStatus: 'call_failed',
        error: error.message,
        checkedAt: new Date().toISOString()
      }
    });
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

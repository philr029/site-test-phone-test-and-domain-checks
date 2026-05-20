import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import twilio from 'twilio';
import { getPhoneTargets } from './config/target-loader.js';

dotenv.config();

const repoRoot = process.cwd();
const reportPath = path.join(repoRoot, 'reports', 'phone-report.json');

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

const recommendedAction = (resultStatus, errorMessage) => {
  if (resultStatus === 'skipped_missing_twilio_keys') {
    return 'Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER to .env or GitHub secrets.';
  }
  if (resultStatus === 'invalid_number') {
    return 'Fix the phone number format in config/targets.json (use E.164, e.g. +441234567890).';
  }
  if (resultStatus === 'call_failed') {
    return `Review Twilio error logs. ${errorMessage || 'Check account permissions and verified caller ID.'}`;
  }
  if (resultStatus === 'no_answer') {
    return 'Confirm the line rings during the test window or extend polling in phone-test.js.';
  }
  if (resultStatus === 'call_started') {
    return 'Call was initiated but final status was not confirmed before timeout. Add a Twilio status callback URL for fuller answer detection.';
  }
  if (resultStatus === 'call_answered') {
    return 'No action required unless business rules require a longer connected call test.';
  }
  return 'Review phone-report.json and Twilio call logs for this target.';
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const pollCallStatus = async (client, callSid, maxMs = 30000) => {
  const startedAt = Date.now();
  let latest = null;

  while (Date.now() - startedAt <= maxMs) {
    latest = await client.calls(callSid).fetch();
    const mapped = mapTwilioStatus(latest.status);

    if (['call_answered', 'busy', 'no_answer', 'call_failed', 'call_completed'].includes(mapped)) {
      return { call: latest, mappedStatus: mapped };
    }

    await sleep(2000);
  }

  return {
    call: latest,
    mappedStatus: latest ? mapTwilioStatus(latest.status) : 'status_unknown',
    timedOut: true
  };
};

const isValidE164 = (number) => /^\+[1-9]\d{7,14}$/.test(number);

const run = async () => {
  const { environment, targets } = await getPhoneTargets();
  const missing = TWILIO_REQUIRED.filter((name) => !process.env[name]);
  const generatedAt = new Date().toISOString();
  const logs = [];

  if (targets.length === 0) {
    const report = {
      generatedAt,
      environment,
      status: 'skipped',
      summary: 'No phone targets enabled in config/targets.json',
      logs: [],
      skippedReason: 'Set phone.enabled=true and provide phone.number for at least one target.'
    };
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
    console.log(JSON.stringify(report));
    return;
  }

  if (missing.length > 0) {
    for (const target of targets) {
      logs.push({
        dateTime: generatedAt,
        targetName: target.name,
        phoneNumber: target.phone.number,
        callSid: null,
        resultStatus: 'skipped_missing_twilio_keys',
        errorMessage: `Missing: ${missing.join(', ')}`,
        nextRecommendedAction: recommendedAction('skipped_missing_twilio_keys'),
        note: 'Outbound call was not attempted because Twilio credentials are missing.'
      });
    }

    const report = {
      generatedAt,
      environment,
      status: 'skipped',
      summary: 'Skipped phone tests because Twilio keys are missing',
      skippedReason: `Missing required secrets: ${missing.join(', ')}`,
      logs
    };

    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
    console.log(JSON.stringify(report));
    return;
  }

  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  const fromNumber = process.env.TWILIO_FROM_NUMBER;
  const twimlUrl =
    process.env.TWILIO_TEST_CALL_TWIML_URL || 'http://demo.twilio.com/docs/voice.xml';

  for (const target of targets) {
    const phoneNumber = target.phone.number;
    const entry = {
      dateTime: new Date().toISOString(),
      targetName: target.name,
      phoneNumber,
      callSid: null,
      resultStatus: 'call_failed',
      errorMessage: null,
      twilioStatus: null,
      expectedBehaviour: target.phone.expectedBehaviour,
      nextRecommendedAction: null,
      note: null
    };

    if (!isValidE164(phoneNumber)) {
      entry.resultStatus = 'invalid_number';
      entry.errorMessage = 'Phone number must be E.164 format (example: +441234567890)';
      entry.nextRecommendedAction = recommendedAction('invalid_number');
      logs.push(entry);
      continue;
    }

    try {
      const call = await client.calls.create({
        to: phoneNumber,
        from: fromNumber,
        url: twimlUrl,
        timeout: Number(process.env.TWILIO_CALL_TIMEOUT_SEC || 25)
      });

      entry.callSid = call.sid;
      entry.twilioStatus = call.status;
      entry.resultStatus = mapTwilioStatus(call.status);

      const polled = await pollCallStatus(client, call.sid);
      entry.twilioStatus = polled.call?.status || entry.twilioStatus;
      entry.resultStatus = polled.mappedStatus;

      if (polled.timedOut && entry.resultStatus === 'call_started') {
        entry.note =
          'Call started but final answer detection timed out. Configure TWILIO_STATUS_CALLBACK_URL for richer status updates.';
      }

      if (entry.resultStatus === 'call_completed' && polled.call?.duration === '0') {
        entry.resultStatus = 'no_answer';
      }
    } catch (error) {
      entry.resultStatus = 'call_failed';
      entry.errorMessage = error.message;
    }

    entry.nextRecommendedAction = recommendedAction(entry.resultStatus, entry.errorMessage);
    logs.push(entry);
  }

  const hasFailure = logs.some((log) =>
    ['call_failed', 'invalid_number', 'busy'].includes(log.resultStatus)
  );
  const hasHardFailure = logs.some((log) => log.resultStatus === 'call_failed');

  const report = {
    generatedAt,
    environment,
    status: hasHardFailure ? 'failed' : hasFailure ? 'warning' : 'passed',
    summary: `${logs.length} phone target(s) tested`,
    logs,
    limitations:
      'Answer detection relies on Twilio call status polling only. For production-grade IVR/answer analytics, add a status callback webhook.'
  };

  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify(report));

  if (hasHardFailure) {
    process.exitCode = 1;
  }
};

run();

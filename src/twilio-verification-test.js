import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import twilio from 'twilio';
import { chromium } from 'playwright';
import { sendNotification } from './utils/notifier.js';

dotenv.config();

const repoRoot = process.cwd();
const reportPath = path.join(repoRoot, 'reports', 'twilio-report.json');

const writeReport = async (result) => {
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify(result, null, 2), 'utf8');
};

const required = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'];
const missing = required.filter((name) => !process.env[name]);

if (missing.length > 0) {
  const skipped = {
    status: 'skipped',
    reason: `Missing required secrets: ${missing.join(', ')}`,
    timestamp: new Date().toISOString()
  };
  await writeReport(skipped);
  console.log(JSON.stringify(skipped));
  process.exit(0);
}

const sleepWithSignal = (ms, signal) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);

    const abortHandler = () => {
      clearTimeout(timer);
      reject(new Error('Polling aborted'));
    };

    signal.addEventListener('abort', abortHandler, { once: true });

    setTimeout(() => {
      signal.removeEventListener('abort', abortHandler);
    }, ms + 1);
  });

const pollForOtp = async ({ client, to, regex, expectedFrom, maxTimeoutMs = 60000 }) => {
  const controller = new AbortController();
  const startedAt = Date.now();
  let delayMs = 1500;

  try {
    while (Date.now() - startedAt <= maxTimeoutMs) {
      const messages = await client.messages.list({ to, limit: 20 });
      const candidate = messages.find((message) => {
        if (expectedFrom && message.from !== expectedFrom) return false;
        return regex.test(message.body || '');
      });

      if (candidate) {
        const match = (candidate.body || '').match(regex);
        const token = match?.[1] || match?.[0];
        if (token) {
          return { token, sourceMessage: candidate, elapsedMs: Date.now() - startedAt };
        }
      }

      await sleepWithSignal(delayMs, controller.signal);
      delayMs = Math.min(delayMs * 2, 10000);
    }

    return null;
  } finally {
    controller.abort();
  }
};

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const mode = (process.env.TWILIO_TEST_MODE || 'otp').toLowerCase();

const testOutboundWebhookFlow = async () => {
  if (!process.env.TWILIO_FROM_NUMBER || !process.env.TWILIO_TO_NUMBER) {
    return {
      status: 'skipped',
      reason: 'TWILIO_FROM_NUMBER and TWILIO_TO_NUMBER are required for webhook mode'
    };
  }

  const body = `Automated verification ping ${new Date().toISOString()}`;
  const message = await client.messages.create({
    to: process.env.TWILIO_TO_NUMBER,
    from: process.env.TWILIO_FROM_NUMBER,
    body
  });

  return {
    status: ['queued', 'accepted', 'sending', 'sent', 'delivered'].includes(message.status)
      ? 'passed'
      : 'failed',
    mode: 'webhook',
    messageSid: message.sid,
    messageStatus: message.status,
    body
  };
};

const testOtpReceiveAndPlaywrightFlow = async () => {
  if (!process.env.TWILIO_TO_NUMBER) {
    return {
      status: 'skipped',
      reason: 'TWILIO_TO_NUMBER is required for OTP mode'
    };
  }

  const regex = new RegExp(process.env.TWILIO_OTP_REGEX || '\\b(\\d{4,8})\\b');
  const expectedFrom = process.env.TWILIO_EXPECTED_FROM;

  const otp = await pollForOtp({
    client,
    to: process.env.TWILIO_TO_NUMBER,
    regex,
    expectedFrom,
    maxTimeoutMs: Number(process.env.TWILIO_OTP_TIMEOUT_MS || 60000)
  });

  if (!otp) {
    return {
      status: 'failed',
      mode: 'otp',
      reason: 'No OTP message found before timeout'
    };
  }

  const otpPageUrl = process.env.OTP_PAGE_URL || process.env.TEST_TARGET_URL;
  const otpFieldSelector = process.env.OTP_FIELD_SELECTOR;
  const otpSubmitSelector = process.env.OTP_SUBMIT_SELECTOR;

  let playwrightStatus = 'skipped';

  if (otpPageUrl && otpFieldSelector) {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    try {
      await page.goto(otpPageUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.fill(otpFieldSelector, otp.token);
      if (otpSubmitSelector) {
        await page.click(otpSubmitSelector);
      }
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      playwrightStatus = 'passed';
    } catch (error) {
      playwrightStatus = `failed: ${error.message}`;
    } finally {
      await browser.close();
    }
  }

  return {
    status: playwrightStatus.startsWith('failed') ? 'failed' : 'passed',
    mode: 'otp',
    otpCode: otp.token,
    messageSid: otp.sourceMessage.sid,
    pollingElapsedMs: otp.elapsedMs,
    playwrightStatus
  };
};

const run = async () => {
  let result;

  if (mode === 'webhook') {
    result = await testOutboundWebhookFlow();
  } else {
    result = await testOtpReceiveAndPlaywrightFlow();
  }

  const payload = { ...result, timestamp: new Date().toISOString() };
  await writeReport(payload);

  if (payload.status === 'failed') {
    await sendNotification({
      title: 'Twilio Verification Failure',
      environment: process.env.TEST_ENVIRONMENT || 'unknown',
      targetName: process.env.TWILIO_TO_NUMBER || 'twilio',
      details: payload.reason || payload.playwrightStatus || 'Twilio verification failed',
      timestamp: payload.timestamp
    }).catch(() => {});

    console.error(JSON.stringify(payload));
    process.exit(1);
  }

  console.log(JSON.stringify(payload));
};

run();

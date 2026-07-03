/**
 * Report which API keys and env vars are configured.
 * Run: npm run check:env
 */
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

const root = path.resolve(import.meta.dirname, '..');
const envPath = path.join(root, '.env');
const examplePath = path.join(root, '.env.example');

if (!fs.existsSync(envPath)) {
  console.error('Missing .env — copy the template first:\n  cp .env.example .env');
  process.exit(1);
}

dotenv.config({ path: envPath });

const groups = [
  {
    name: 'Phone line tests (Twilio)',
    required: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER'],
    optional: ['TWILIO_TEST_CALL_TWIML_URL', 'TWILIO_CALL_TIMEOUT_SEC', 'TWILIO_STATUS_CALLBACK_URL'],
    docs: 'https://console.twilio.com/'
  },
  {
    name: 'Twilio SMS/OTP verification (optional)',
    required: [],
    optional: [
      'TWILIO_TO_NUMBER',
      'TWILIO_TEST_MODE',
      'TWILIO_OTP_REGEX',
      'TWILIO_EXPECTED_FROM',
      'TWILIO_OTP_TIMEOUT_MS',
      'OTP_PAGE_URL',
      'OTP_FIELD_SELECTOR',
      'OTP_SUBMIT_SELECTOR'
    ],
    docs: 'https://console.twilio.com/'
  },
  {
    name: 'Domain reputation (MXToolbox)',
    required: [],
    optional: ['MXTOOLBOX_API_KEY'],
    docs: 'https://mxtoolbox.com/ProductInfo/API.aspx',
    note: 'Without this key, DNS fallback checks still run.'
  },
  {
    name: 'Optional reputation APIs (dashboard placeholders)',
    required: [],
    optional: ['ABUSEIPDB_API_KEY', 'VIRUSTOTAL_API_KEY', 'HETRIXTOOLS_API_KEY'],
    docs: 'https://www.abuseipdb.com/account/api | https://www.virustotal.com/gui/my-apikey'
  },
  {
    name: 'Notifications (optional)',
    required: [],
    optional: ['NOTIFIER_PROVIDER', 'NOTIFIER_WEBHOOK_URL'],
    note: 'Use a Slack/Teams/generic webhook URL for CI alerts.'
  }
];

const isSet = (name) => {
  const value = process.env[name];
  return Boolean(value && String(value).trim());
};

const status = (name) => (isSet(name) ? 'configured' : 'missing');

console.log(`\nEnvironment check (${envPath})\n`);

for (const group of groups) {
  console.log(group.name);
  if (group.docs) console.log(`  Docs: ${group.docs}`);
  if (group.note) console.log(`  Note: ${group.note}`);

  for (const name of group.required) {
    console.log(`  ${status(name) === 'configured' ? '✓' : '✗'} ${name} (required)`);
  }
  for (const name of group.optional) {
    if (group.required.includes(name)) continue;
    console.log(`  ${status(name) === 'configured' ? '✓' : '○'} ${name}`);
  }
  console.log('');
}

const exampleKeys = fs
  .readFileSync(examplePath, 'utf8')
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#') && line.includes('='))
  .map((line) => line.split('=')[0]);

const undocumented = exampleKeys.filter(
  (key) => !groups.some((group) => group.required.includes(key) || group.optional.includes(key))
);

if (undocumented.length) {
  console.log('Other variables from .env.example');
  for (const name of undocumented) {
    console.log(`  ${status(name) === 'configured' ? '✓' : '○'} ${name}`);
  }
  console.log('');
}

const twilioReady = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER'].every(isSet);
const mxtoolboxReady = isSet('MXTOOLBOX_API_KEY');

console.log('Summary');
console.log(`  Twilio phone tests: ${twilioReady ? 'ready' : 'skipped until TWILIO_* keys are set'}`);
console.log(`  MXToolbox API: ${mxtoolboxReady ? 'ready' : 'using DNS fallback'}`);
console.log(`  Dashboard API: npm run dev  →  http://127.0.0.1:${process.env.DASHBOARD_PORT || 8080}/`);
console.log('');

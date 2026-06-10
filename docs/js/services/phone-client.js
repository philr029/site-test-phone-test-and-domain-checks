import { apiPost, isApiAvailable } from './api-client.js';

const E164_REGEX = /^\+[1-9]\d{7,14}$/;
const DEFAULT_CARRIER = 'Unknown carrier';
const DEFAULT_LINE_TYPE = 'unknown';
const MOCK_TWILIO_RESPONSES = [
  {
    twilioStatus: 'completed',
    callStatus: 'call_answered',
    carrier: 'MockTel Wireless',
    lineType: 'mobile',
    sid: 'CA_BROWSER_MOCK_COMPLETED'
  },
  {
    twilioStatus: 'busy',
    callStatus: 'busy',
    carrier: 'MockTel Business',
    lineType: 'landline',
    sid: 'CA_BROWSER_MOCK_BUSY'
  },
  {
    twilioStatus: 'no-answer',
    callStatus: 'no_answer',
    carrier: 'MockTel Residential',
    lineType: 'voip',
    sid: 'CA_BROWSER_MOCK_NO_ANSWER'
  },
  {
    twilioStatus: 'queued',
    callStatus: 'call_started',
    carrier: 'MockTel Queue',
    lineType: 'mobile',
    sid: 'CA_BROWSER_MOCK_QUEUED'
  }
];

const normalizePhoneResult = (payload = {}, fallback = {}) => {
  const raw = payload.raw || fallback.raw || {};
  return {
    status: payload.status || fallback.status || 'warn',
    carrier: payload.carrier || fallback.carrier || DEFAULT_CARRIER,
    lineType: payload.lineType || fallback.lineType || DEFAULT_LINE_TYPE,
    notes: payload.notes || fallback.notes || '',
    raw
  };
};

export const runPhoneTestMock = ({ phoneNumber, testName, expectedOutcome, notes }) => {
  const normalizedNumber = String(phoneNumber || '').trim();
  if (!E164_REGEX.test(normalizedNumber)) {
    return normalizePhoneResult(
      {},
      {
        status: 'fail',
        notes: 'Invalid E.164 format (e.g. +441234567890)',
        raw: {
          mode: 'mock',
          phoneNumber: normalizedNumber,
          testName: testName || 'Mock test',
          expectedOutcome: expectedOutcome || '',
          userNotes: notes || '',
          callStatus: 'invalid_number',
          checkedAt: new Date().toISOString()
        }
      }
    );
  }
  const mock = MOCK_TWILIO_RESPONSES[Math.floor(Math.random() * MOCK_TWILIO_RESPONSES.length)];
  return normalizePhoneResult(
    {},
    {
      status: ['call_answered', 'call_completed'].includes(mock.callStatus)
        ? 'pass'
        : mock.callStatus === 'call_started'
          ? 'warn'
          : 'fail',
      carrier: mock.carrier,
      lineType: mock.lineType,
      notes:
        notes ||
        'Mock mode on GitHub Pages — start npm run dev:api with Twilio keys in .env for real calls.',
      raw: {
        mode: 'mock',
        phoneNumber: normalizedNumber,
        testName: testName || 'Mock test',
        expectedOutcome: expectedOutcome || '',
        userNotes: notes || '',
        callStatus: mock.callStatus,
        twilioStatus: mock.twilioStatus,
        twilioSid: mock.sid,
        mockTwilioResponse: mock,
        checkedAt: new Date().toISOString()
      }
    }
  );
};

export const runPhoneTest = async (payload) => {
  if (isApiAvailable()) {
    const data = await apiPost('/api/phone/test', payload);
    return normalizePhoneResult(data);
  }
  return runPhoneTestMock(payload);
};

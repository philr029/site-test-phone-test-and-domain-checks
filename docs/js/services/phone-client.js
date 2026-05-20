import { apiPost, isApiAvailable } from './api-client.js';

export const runPhoneTestMock = ({ phoneNumber, testName, expectedOutcome, notes }) => {
  const statuses = ['call_started', 'call_answered', 'busy', 'no_answer'];
  const callStatus = statuses[Math.floor(Math.random() * statuses.length)];
  return {
    mode: 'mock',
    phoneNumber,
    testName: testName || 'Mock test',
    expectedOutcome,
    notes,
    callStatus,
    status: 'warn',
    passed: null,
    detail: 'Mock mode — start npm run dev:api with Twilio keys in .env for real calls.',
    checkedAt: new Date().toISOString()
  };
};

export const runPhoneTest = async (payload) => {
  if (isApiAvailable()) {
    return apiPost('/api/phone/test', payload);
  }
  return runPhoneTestMock(payload);
};

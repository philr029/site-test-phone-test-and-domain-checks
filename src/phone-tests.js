import {
  runPhoneTest as runPhoneTestImpl,
  runMockPhoneTest as runMockPhoneTestImpl,
  getPhoneConfigStatus
} from './lib/phone-checks.js';
import { mockWrapper, normaliseResult, timeExecution } from './helpers/test-utils.js';

const toPhoneSummary = (result) => {
  if (result?.notes) return String(result.notes);
  if (result?.status === 'pass') return 'Phone test completed successfully';
  if (result?.status === 'warn') return 'Phone test completed with warnings';
  return 'Phone test failed';
};

const toStandardPhoneResult = (result, durationMs) =>
  normaliseResult(
    result?.status,
    toPhoneSummary(result),
    {
      carrier: result?.carrier || 'Unknown carrier',
      lineType: result?.lineType || 'unknown',
      notes: result?.notes || '',
      durationMs
    },
    result?.raw || null
  );

const defaultMockPayload = ({ phoneNumber, testName, expectedOutcome, notes }) => ({
  phoneNumber,
  testName: testName || 'Mock phone test',
  expectedOutcome: expectedOutcome || 'should answer',
  notes
});

export const runMockPhoneTest = async ({ phoneNumber, testName, expectedOutcome, notes, mockMode = true } = {}) => {
  try {
    return await mockWrapper({
      mockMode,
      mockFactory: async () => {
        const timed = await timeExecution(async () =>
          runMockPhoneTestImpl(defaultMockPayload({ phoneNumber, testName, expectedOutcome, notes }))
        );
        return toStandardPhoneResult(timed.result, timed.durationMs);
      },
      runFactory: async () => {
        const timed = await timeExecution(async () =>
          runMockPhoneTestImpl(defaultMockPayload({ phoneNumber, testName, expectedOutcome, notes }))
        );
        return toStandardPhoneResult(timed.result, timed.durationMs);
      }
    });
  } catch (error) {
    return normaliseResult('error', 'Phone mock test failed', { error });
  }
};

export const runPhoneTest = async (
  { phoneNumber, testName, expectedOutcome, notes, mockMode = false } = {},
  env = process.env
) => {
  try {
    return await mockWrapper({
      mockMode,
      mockFactory: async () => runMockPhoneTest({ phoneNumber, testName, expectedOutcome, notes, mockMode: true }),
      runFactory: async () => {
        const timed = await timeExecution(async () =>
          runPhoneTestImpl({ phoneNumber, testName, expectedOutcome, notes }, env)
        );
        return toStandardPhoneResult(timed.result, timed.durationMs);
      }
    });
  } catch (error) {
    return normaliseResult('error', 'Phone test failed', { error });
  }
};

export { getPhoneConfigStatus };

export const REQUIRED_PHONE_TESTS_HTML_UPDATES = [
  'Add a phone test result card with standardized status, summary, details, and raw payload blocks.',
  'Add input controls for phone number, expected outcome, test name, and a mock-mode toggle.',
  'Include helper text indicating mock mode returns realistic placeholder call outcomes without outbound calls.'
];

export const NEW_PHONE_TESTS_CSS_CLASSES = [
  'phone-test-result',
  'phone-test-status',
  'phone-test-status--ok',
  'phone-test-status--warning',
  'phone-test-status--error',
  'phone-test-summary',
  'phone-test-details',
  'phone-test-raw',
  'phone-test-mock-banner'
];

export const UPDATED_PHONE_TESTS_EVENT_LISTENERS = [
  'Bind submit listener on phone test form to pass phone payload plus mockMode to runPhoneTest.',
  'Bind change listener for expected-outcome selector to keep summary text in sync with selected expectation.',
  'Bind mock-mode toggle listener to disable live-call messaging and show mock indicator text.'
];

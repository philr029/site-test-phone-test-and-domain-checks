import { mockWrapper, normaliseResult, safeFetch, timeExecution } from './helpers/test-utils.js';

const FORM_REGEX = /<form\b[^>]*>/gi;
const POPUP_SIGNALS = [
  { id: 'cookie-consent', pattern: /cookie|consent|gdpr/i },
  { id: 'modal', pattern: /modal|popup|dialog|overlay/i },
  { id: 'newsletter', pattern: /newsletter|subscribe|sign[\s-]?up/i }
];
const BANNER_SIGNALS = [
  { id: 'hero', pattern: /hero|masthead/i },
  { id: 'announcement', pattern: /announcement|notice|alert[-_\s]?bar/i },
  { id: 'promo-banner', pattern: /banner|promo|campaign/i }
];
const LINK_REGEX = /href=["']([^"']+)["']/gi;

const normalizeUrl = (url) => (url && url.startsWith('http') ? url : `https://${url || 'example.com'}`);

const extractSampleLinks = (html, baseUrl, sampleSize) => {
  const links = [];
  let match = LINK_REGEX.exec(html);

  while (match) {
    const href = match[1];
    if (href && !href.startsWith('#') && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
      links.push(new URL(href, baseUrl).href);
    }
    match = LINK_REGEX.exec(html);
  }

  return Array.from(new Set(links)).slice(0, sampleSize);
};

export const detectForms = async (html = '', { mockMode = false } = {}) => {
  try {
    return await mockWrapper({
      mockMode,
      mockFactory: async () =>
        normaliseResult(
          'ok',
          'Detected 2 form element(s) (mock)',
          { formCount: 2, sampledSnippets: ['<form id="contact">', '<form id="newsletter">'] },
          { mode: 'mock', htmlSize: html.length }
        ),
      runFactory: async () => {
        const matches = [...html.matchAll(FORM_REGEX)];
        const formCount = matches.length;
        return normaliseResult(
          formCount > 0 ? 'ok' : 'warning',
          formCount > 0 ? `Detected ${formCount} form element(s)` : 'No form elements detected',
          {
            formCount,
            sampledSnippets: matches.slice(0, 5).map((m) => m[0])
          },
          { formCount }
        );
      }
    });
  } catch (error) {
    return normaliseResult('error', 'Failed to detect forms', { error });
  }
};

export const detectPopups = async (html = '', { mockMode = false } = {}) => {
  try {
    return await mockWrapper({
      mockMode,
      mockFactory: async () =>
        normaliseResult(
          'ok',
          'Popup signals found: cookie-consent, newsletter (mock)',
          { matchedSignals: ['cookie-consent', 'newsletter'], checkedSignals: POPUP_SIGNALS.map((signal) => signal.id) },
          { mode: 'mock' }
        ),
      runFactory: async () => {
        const matchedSignals = POPUP_SIGNALS.filter(({ pattern }) => pattern.test(html)).map(({ id }) => id);
        return normaliseResult(
          matchedSignals.length > 0 ? 'ok' : 'warning',
          matchedSignals.length > 0
            ? `Popup signals found: ${matchedSignals.join(', ')}`
            : 'No popup or consent signals detected',
          {
            matchedSignals,
            checkedSignals: POPUP_SIGNALS.map((signal) => signal.id)
          },
          { matchedSignals }
        );
      }
    });
  } catch (error) {
    return normaliseResult('error', 'Failed to detect popup signals', { error });
  }
};

export const detectBanners = async (html = '', { mockMode = false } = {}) => {
  try {
    return await mockWrapper({
      mockMode,
      mockFactory: async () =>
        normaliseResult(
          'ok',
          'Banner signals found: hero, promo-banner (mock)',
          { matchedSignals: ['hero', 'promo-banner'], checkedSignals: BANNER_SIGNALS.map((signal) => signal.id) },
          { mode: 'mock' }
        ),
      runFactory: async () => {
        const matchedSignals = BANNER_SIGNALS.filter(({ pattern }) => pattern.test(html)).map(({ id }) => id);
        return normaliseResult(
          matchedSignals.length > 0 ? 'ok' : 'warning',
          matchedSignals.length > 0
            ? `Banner signals found: ${matchedSignals.join(', ')}`
            : 'No banner or announcement signals detected',
          {
            matchedSignals,
            checkedSignals: BANNER_SIGNALS.map((signal) => signal.id)
          },
          { matchedSignals }
        );
      }
    });
  } catch (error) {
    return normaliseResult('error', 'Failed to detect banner signals', { error });
  }
};

export const measurePageLoadTiming = async ({ durationMs = null, httpStatus = null, thresholdMs = 3000, mockMode = false } = {}) => {
  try {
    return await mockWrapper({
      mockMode,
      mockFactory: async () =>
        normaliseResult(
          'warning',
          'Mock mode: page load timing approximated at 1240ms',
          { durationMs: 1240, httpStatus: 200, thresholdMs, mode: 'mock' },
          { mode: 'mock' }
        ),
      runFactory: async () => {
        if (durationMs === null || Number.isNaN(Number(durationMs))) {
          return normaliseResult(
            'warning',
            'Page load timing unavailable',
            { durationMs: null, httpStatus, thresholdMs },
            { durationMs: null, httpStatus, thresholdMs }
          );
        }

        const numericDuration = Number(durationMs);
        if (httpStatus !== null && httpStatus >= 400) {
          return normaliseResult(
            'error',
            `HTTP ${httpStatus} after ${numericDuration}ms`,
            { durationMs: numericDuration, httpStatus, thresholdMs },
            { durationMs: numericDuration, httpStatus, thresholdMs }
          );
        }

        const hasIssues = numericDuration > thresholdMs;
        return normaliseResult(
          hasIssues ? 'warning' : 'ok',
          hasIssues ? `Slow load: ${numericDuration}ms (target ${thresholdMs}ms)` : `Loaded in ${numericDuration}ms`,
          { durationMs: numericDuration, httpStatus, thresholdMs },
          { durationMs: numericDuration, httpStatus, thresholdMs }
        );
      }
    });
  } catch (error) {
    return normaliseResult('error', 'Failed to measure page load timing', { error });
  }
};

export const sampleBrokenLinks = async ({
  html = '',
  url = 'https://example.com',
  sampleSize = 5,
  fetchImpl = globalThis.fetch,
  mockMode = false
} = {}) => {
  try {
    return await mockWrapper({
      mockMode,
      mockFactory: async () =>
        normaliseResult(
          'warning',
          'Sampled 4 link(s); 1 potential issue(s) (mock)',
          {
            sampledCount: 4,
            issueCount: 1,
            sampled: ['https://example.com/pricing', 'https://example.com/contact']
          },
          {
            mode: 'mock',
            sampled: ['https://example.com/pricing', 'https://example.com/contact', 'https://example.com/about'],
            checked: [
              { url: 'https://example.com/pricing', status: 200 },
              { url: 'https://example.com/contact', status: 404 }
            ],
            broken: [{ url: 'https://example.com/contact', status: 404 }]
          }
        ),
      runFactory: async () => {
        const baseUrl = normalizeUrl(url);
        const sampled = extractSampleLinks(html, baseUrl, sampleSize);
        const broken = [];
        const checked = [];

        const timed = await timeExecution(async () => {
          for (const link of sampled) {
            try {
              const response = await safeFetch(link, { method: 'HEAD' }, { fetchImpl, mockMode: false });
              const status = response.status;
              checked.push({ url: link, status });
              if (!response.ok && status !== 405) {
                broken.push({ url: link, status });
              }
            } catch (error) {
              broken.push({ url: link, error: error.message || 'request failed' });
              checked.push({ url: link, status: 'error' });
            }
          }
        });

        return normaliseResult(
          broken.length > 0 ? 'warning' : 'ok',
          sampled.length === 0
            ? 'No links available to sample'
            : `Sampled ${sampled.length} link(s); ${broken.length} potential issue(s)`,
          {
            sampledCount: sampled.length,
            issueCount: broken.length,
            checkedCount: checked.length,
            durationMs: timed.durationMs
          },
          {
            sampled,
            checked,
            broken,
            durationMs: timed.durationMs
          }
        );
      }
    });
  } catch (error) {
    return normaliseResult('error', 'Failed to sample broken links', { error });
  }
};

export const REQUIRED_SITE_TESTS_HTML_UPDATES = [
  'Add a dedicated site test result grid with rows for form, popup, banner, page-load, and broken-links.',
  'Each row must include fields for standardized status, summary, details, and optional raw payload preview.',
  'Add a mock-mode indicator near the run action and a text note explaining no external calls run in mock mode.'
];

export const NEW_SITE_TESTS_CSS_CLASSES = [
  'site-test-grid',
  'site-test-item',
  'site-test-status',
  'site-test-status--ok',
  'site-test-status--warning',
  'site-test-status--error',
  'site-test-summary',
  'site-test-details',
  'site-test-raw',
  'site-test-mock-banner'
];

export const UPDATED_SITE_TESTS_EVENT_LISTENERS = [
  'Bind submit listener for site test form to pass mockMode and target URL into site test functions.',
  'Bind toggle listener for mock-mode checkbox to update badge state and suppress live network execution.',
  'Bind click listener for raw-data expanders to show/hide the raw payload block per test row.'
];

export const getMockModeOutputs = async (url = 'https://example.com') => ({
  url: normalizeUrl(url),
  mode: 'mock',
  results: {
    form: await detectForms('', { mockMode: true }),
    popup: await detectPopups('', { mockMode: true }),
    banner: await detectBanners('', { mockMode: true }),
    pageLoad: await measurePageLoadTiming({ mockMode: true }),
    brokenLinks: await sampleBrokenLinks({ url, mockMode: true })
  }
});

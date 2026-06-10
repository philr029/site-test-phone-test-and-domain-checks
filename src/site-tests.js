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

const formatStatus = (hasIssues) => (hasIssues ? 'warn' : 'pass');

export const detectForms = (html = '') => {
  const matches = [...html.matchAll(FORM_REGEX)];
  const formCount = matches.length;
  return {
    status: formCount > 0 ? 'pass' : 'warn',
    details: formCount > 0 ? `Detected ${formCount} form element(s)` : 'No form elements detected',
    raw: {
      formCount,
      snippets: matches.slice(0, 5).map((m) => m[0])
    }
  };
};

export const detectPopups = (html = '') => {
  const matchedSignals = POPUP_SIGNALS.filter(({ pattern }) => pattern.test(html)).map(({ id }) => id);
  return {
    status: matchedSignals.length > 0 ? 'pass' : 'warn',
    details:
      matchedSignals.length > 0
        ? `Popup signals found: ${matchedSignals.join(', ')}`
        : 'No popup or consent signals detected',
    raw: {
      matchedSignals,
      checkedSignals: POPUP_SIGNALS.map((signal) => signal.id)
    }
  };
};

export const detectBanners = (html = '') => {
  const matchedSignals = BANNER_SIGNALS.filter(({ pattern }) => pattern.test(html)).map(({ id }) => id);
  return {
    status: matchedSignals.length > 0 ? 'pass' : 'warn',
    details:
      matchedSignals.length > 0
        ? `Banner signals found: ${matchedSignals.join(', ')}`
        : 'No banner or announcement signals detected',
    raw: {
      matchedSignals,
      checkedSignals: BANNER_SIGNALS.map((signal) => signal.id)
    }
  };
};

export const measurePageLoadTiming = ({ durationMs = null, httpStatus = null, thresholdMs = 3000 } = {}) => {
  if (durationMs === null || Number.isNaN(Number(durationMs))) {
    return {
      status: 'warn',
      details: 'Page load timing unavailable',
      raw: { durationMs: null, httpStatus, thresholdMs }
    };
  }

  const numericDuration = Number(durationMs);
  if (httpStatus !== null && httpStatus >= 400) {
    return {
      status: 'fail',
      details: `HTTP ${httpStatus} after ${numericDuration}ms`,
      raw: { durationMs: numericDuration, httpStatus, thresholdMs }
    };
  }

  const hasIssues = numericDuration > thresholdMs;
  return {
    status: formatStatus(hasIssues),
    details: hasIssues
      ? `Slow load: ${numericDuration}ms (target ${thresholdMs}ms)`
      : `Loaded in ${numericDuration}ms`,
    raw: { durationMs: numericDuration, httpStatus, thresholdMs }
  };
};

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

export const sampleBrokenLinks = async ({
  html = '',
  url = 'https://example.com',
  sampleSize = 5,
  fetchImpl = globalThis.fetch,
  mockMode = false
} = {}) => {
  if (mockMode || typeof fetchImpl !== 'function') {
    return {
      status: 'skip',
      details: 'Mock mode: broken link sampling is not executed',
      raw: { sampled: [], broken: [], mode: 'mock' }
    };
  }

  const baseUrl = normalizeUrl(url);
  const sampled = extractSampleLinks(html, baseUrl, sampleSize);
  const broken = [];
  const checked = [];

  for (const link of sampled) {
    try {
      const response = await fetchImpl(link, { method: 'HEAD' });
      const status = response.status;
      checked.push({ url: link, status });
      if (!response.ok && status !== 405) broken.push({ url: link, status });
    } catch (error) {
      broken.push({ url: link, error: error.message || 'request failed' });
      checked.push({ url: link, status: 'error' });
    }
  }

  return {
    status: broken.length > 0 ? 'warn' : 'pass',
    details:
      sampled.length === 0
        ? 'No links available to sample'
        : `Sampled ${sampled.length} link(s); ${broken.length} potential issue(s)`,
    raw: {
      sampled,
      checked,
      broken
    }
  };
};

export const REQUIRED_SITE_TESTS_HTML_UPDATES = [
  'Add a dedicated results section in site-tests.html for five checks: form, popup, banner, page-load, and broken-links.',
  'Add per-check rows/cards with placeholders for status, details, and optional raw data expansion.',
  'Add a mock-mode badge/message near the run button to clarify GitHub Pages always uses mock output.'
];

export const NEW_SITE_TESTS_CSS_CLASSES = [
  'site-test-grid',
  'site-test-item',
  'site-test-status',
  'site-test-status--pass',
  'site-test-status--warn',
  'site-test-status--fail',
  'site-test-status--skip',
  'site-test-details',
  'site-test-raw',
  'site-test-mock-banner'
];

export const getMockModeOutputs = (url = 'https://example.com') => ({
  url: normalizeUrl(url),
  mode: 'mock',
  results: {
    form: { status: 'skip', details: 'Mock mode on GitHub Pages', raw: { mode: 'mock' } },
    popup: { status: 'skip', details: 'Mock mode on GitHub Pages', raw: { mode: 'mock' } },
    banner: { status: 'skip', details: 'Mock mode on GitHub Pages', raw: { mode: 'mock' } },
    pageLoad: { status: 'warn', details: 'Load timing requires local API', raw: { mode: 'mock' } },
    brokenLinks: { status: 'skip', details: 'Link sampling requires local API', raw: { mode: 'mock' } }
  }
});

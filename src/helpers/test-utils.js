const STATUS_MAP = {
  ok: 'ok',
  warning: 'warning',
  error: 'error',
  pass: 'ok',
  warn: 'warning',
  fail: 'error',
  failed: 'error',
  skip: 'warning',
  skipped: 'warning'
};

export const normaliseResult = (status, summary, details = {}, raw = null) => {
  const normalisedStatus = STATUS_MAP[String(status || '').toLowerCase()] || 'error';
  const normalisedSummary = String(summary || '').trim() || 'No summary provided';
  const normalisedDetails = details && typeof details === 'object' ? details : { value: details };

  return {
    status: normalisedStatus,
    summary: normalisedSummary,
    details: normalisedDetails,
    raw
  };
};

export const safeFetch = async (url, options = {}, { mockMode = false, mockData = null, fetchImpl = globalThis.fetch } = {}) => {
  if (mockMode) {
    return {
      ok: true,
      status: 200,
      mock: true,
      url,
      async json() {
        if (mockData && typeof mockData === 'object') return mockData;
        return { data: mockData };
      },
      async text() {
        if (typeof mockData === 'string') return mockData;
        return JSON.stringify(mockData ?? '');
      }
    };
  }

  if (typeof fetchImpl !== 'function') {
    throw new Error('Fetch implementation is unavailable');
  }

  try {
    return await fetchImpl(url, options);
  } catch (error) {
    throw new Error(`Request failed for ${url}: ${error.message || 'unknown error'}`);
  }
};

export const mockWrapper = async ({ mockMode = false, mockFactory, runFactory }) => {
  if (mockMode) {
    return await mockFactory();
  }
  return await runFactory();
};

export const timeExecution = async (fn) => {
  const startedAt = Date.now();
  const result = await fn();
  return {
    durationMs: Date.now() - startedAt,
    result
  };
};

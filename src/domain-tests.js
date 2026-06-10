import {
  checkMx as checkMxImpl,
  checkSpf as checkSpfImpl,
  checkDkim as checkDkimImpl,
  checkDmarc as checkDmarcImpl,
  checkBlacklistPlaceholder as checkBlacklistPlaceholderImpl,
  checkIpReputationPlaceholder as checkIpReputationPlaceholderImpl,
  probeSsl as probeSslImpl,
  runTargetCheck as runTargetCheckImpl
} from './lib/domain-checks.js';
import { mockWrapper, normaliseResult, timeExecution } from './helpers/test-utils.js';

const toStandardDomainResult = (status, summary, details = {}, raw = null) =>
  normaliseResult(status, summary, details, raw);

const toDomainCheckResult = (label, result, durationMs) =>
  toStandardDomainResult(
    result?.status,
    result?.records?.length
      ? `${label} check found ${result.records.length} record(s)`
      : `${label} check returned no records`,
    {
      recordCount: Array.isArray(result?.records) ? result.records.length : 0,
      records: Array.isArray(result?.records) ? result.records : [],
      durationMs
    },
    result?.raw || null
  );

const mockDnsRecords = {
  mx: ['10 mail.example.com'],
  spf: ['v=spf1 include:_spf.example.com ~all'],
  dkim: ['v=DKIM1; k=rsa; p=MOCKKEY123'],
  dmarc: ['v=DMARC1; p=none; rua=mailto:dmarc@example.com']
};

export const checkMx = async (domain, { mockMode = false } = {}) => {
  try {
    return await mockWrapper({
      mockMode,
      mockFactory: async () =>
        toStandardDomainResult('ok', `MX check found 1 record(s) (mock)`, {
          recordCount: mockDnsRecords.mx.length,
          records: mockDnsRecords.mx,
          domain
        }, {
          mode: 'mock',
          domain,
          records: mockDnsRecords.mx
        }),
      runFactory: async () => {
        const timed = await timeExecution(async () => checkMxImpl(domain));
        return toDomainCheckResult('MX', timed.result, timed.durationMs);
      }
    });
  } catch (error) {
    return normaliseResult('error', 'MX check failed', { error });
  }
};

export const checkSpf = async (domain, { mockMode = false } = {}) => {
  try {
    return await mockWrapper({
      mockMode,
      mockFactory: async () =>
        toStandardDomainResult('ok', `SPF check found 1 record(s) (mock)`, {
          recordCount: mockDnsRecords.spf.length,
          records: mockDnsRecords.spf,
          domain
        }, {
          mode: 'mock',
          domain,
          records: mockDnsRecords.spf
        }),
      runFactory: async () => {
        const timed = await timeExecution(async () => checkSpfImpl(domain));
        return toDomainCheckResult('SPF', timed.result, timed.durationMs);
      }
    });
  } catch (error) {
    return normaliseResult('error', 'SPF check failed', { error });
  }
};

export const checkDkim = async (domain, selector, { mockMode = false } = {}) => {
  try {
    return await mockWrapper({
      mockMode,
      mockFactory: async () =>
        toStandardDomainResult('ok', `DKIM check found 1 record(s) (mock)`, {
          recordCount: mockDnsRecords.dkim.length,
          records: mockDnsRecords.dkim,
          domain,
          selector: selector || 'default'
        }, {
          mode: 'mock',
          domain,
          selector: selector || 'default',
          records: mockDnsRecords.dkim
        }),
      runFactory: async () => {
        const timed = await timeExecution(async () => checkDkimImpl(domain, selector));
        return toDomainCheckResult('DKIM', timed.result, timed.durationMs);
      }
    });
  } catch (error) {
    return normaliseResult('error', 'DKIM check failed', { error });
  }
};

export const checkDmarc = async (domain, { mockMode = false } = {}) => {
  try {
    return await mockWrapper({
      mockMode,
      mockFactory: async () =>
        toStandardDomainResult('ok', `DMARC check found 1 record(s) (mock)`, {
          recordCount: mockDnsRecords.dmarc.length,
          records: mockDnsRecords.dmarc,
          domain
        }, {
          mode: 'mock',
          domain,
          records: mockDnsRecords.dmarc
        }),
      runFactory: async () => {
        const timed = await timeExecution(async () => checkDmarcImpl(domain));
        return toDomainCheckResult('DMARC', timed.result, timed.durationMs);
      }
    });
  } catch (error) {
    return normaliseResult('error', 'DMARC check failed', { error });
  }
};

export const checkBlacklistPlaceholder = async (target, { mockMode = false } = {}) => {
  try {
    return await mockWrapper({
      mockMode,
      mockFactory: async () =>
        toStandardDomainResult('warning', 'Blacklist check placeholder returned mock response', {
          target,
          listed: false,
          providersChecked: ['mock-bl-1', 'mock-bl-2']
        }, {
          mode: 'mock',
          target
        }),
      runFactory: async () => {
        const timed = await timeExecution(async () => checkBlacklistPlaceholderImpl(target));
        return toDomainCheckResult('Blacklist', timed.result, timed.durationMs);
      }
    });
  } catch (error) {
    return normaliseResult('error', 'Blacklist placeholder check failed', { error });
  }
};

export const checkIpReputationPlaceholder = async (target, { mockMode = false } = {}) => {
  try {
    return await mockWrapper({
      mockMode,
      mockFactory: async () =>
        toStandardDomainResult('warning', 'IP reputation placeholder returned mock response', {
          target,
          reputationScore: 12,
          classification: 'low-risk'
        }, {
          mode: 'mock',
          target
        }),
      runFactory: async () => {
        const timed = await timeExecution(async () => checkIpReputationPlaceholderImpl(target));
        return toDomainCheckResult('IP reputation', timed.result, timed.durationMs);
      }
    });
  } catch (error) {
    return normaliseResult('error', 'IP reputation placeholder check failed', { error });
  }
};

export const probeSsl = async (domain, { mockMode = false } = {}) => {
  try {
    return await mockWrapper({
      mockMode,
      mockFactory: async () =>
        toStandardDomainResult('ok', 'SSL probe succeeded with HTTP 200 (mock)', {
          domain,
          statusCode: 200,
          certificateState: 'valid'
        }, {
          mode: 'mock',
          url: `https://${domain}`,
          statusCode: 200
        }),
      runFactory: async () => {
        const timed = await timeExecution(async () => probeSslImpl(domain));
        return toDomainCheckResult('SSL', timed.result, timed.durationMs);
      }
    });
  } catch (error) {
    return normaliseResult('error', 'SSL probe failed', { error });
  }
};

export const runTargetCheck = async (input, { mockMode = false, env = process.env } = {}) => {
  try {
    return await mockWrapper({
      mockMode,
      mockFactory: async () => {
        const target = String(input || '').trim() || 'example.com';
        const isIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(target) || target.includes(':');
        return toStandardDomainResult(
          'warning',
          isIp ? 'Mock IP target check completed with warnings' : 'Mock domain target check completed with warnings',
          {
            target,
            type: isIp ? 'ip' : 'domain',
            statusCode: 'WARNING',
            checks: ['mx', 'spf', 'dmarc', 'ssl']
          },
          {
            mode: 'mock',
            target,
            type: isIp ? 'ip' : 'domain',
            checks: {
              mx: mockDnsRecords.mx,
              spf: mockDnsRecords.spf,
              dmarc: mockDnsRecords.dmarc,
              ssl: { statusCode: 200 }
            }
          }
        );
      },
      runFactory: async () => {
        const timed = await timeExecution(async () => runTargetCheckImpl(input, env));
        return toStandardDomainResult(
          timed.result?.critical ? 'error' : timed.result?.warning ? 'warning' : 'ok',
          timed.result?.summary || 'Domain target check completed',
          {
            target: timed.result?.target,
            type: timed.result?.type,
            statusCode: timed.result?.statusCode,
            critical: Boolean(timed.result?.critical),
            warning: Boolean(timed.result?.warning),
            durationMs: timed.durationMs
          },
          timed.result
        );
      }
    });
  } catch (error) {
    return normaliseResult('error', 'Domain target check failed', { error });
  }
};

export const REQUIRED_DOMAIN_TESTS_HTML_UPDATES = [
  'Add a domain test summary panel with standardized status, summary, details, and raw response fields.',
  'Add domain/IP input controls and a mock-mode toggle in the same test form section.',
  'Show per-check rows for MX, SPF, DKIM, DMARC, blacklist, SSL, and IP reputation using unified status values.'
];

export const NEW_DOMAIN_TESTS_CSS_CLASSES = [
  'domain-test-grid',
  'domain-test-item',
  'domain-test-status',
  'domain-test-status--ok',
  'domain-test-status--warning',
  'domain-test-status--error',
  'domain-test-summary',
  'domain-test-details',
  'domain-test-raw',
  'domain-test-mock-banner'
];

export const UPDATED_DOMAIN_TESTS_EVENT_LISTENERS = [
  'Bind submit listener for domain test form to pass target and mockMode into runTargetCheck.',
  'Bind change listener for target type selector to update labels and placeholder validation hints.',
  'Bind mock-mode toggle listener to disable live-check hints and show mock banner messaging.'
];

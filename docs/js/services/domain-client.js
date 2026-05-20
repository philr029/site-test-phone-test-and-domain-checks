/**
 * Domain/IP checks — API when available, Google DNS-over-HTTPS fallback in browser.
 */
import { apiPost, isApiAvailable } from './api-client.js';

const dohQuery = async (name, type) => {
  const res = await fetch(
    `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`,
    { headers: { Accept: 'application/dns-json' } }
  );
  const data = await res.json();
  return data.Answer || [];
};

const isIp = (v) => /^(\d{1,3}\.){3}\d{1,3}$/.test(v);

export const runDomainCheckBrowser = async (target) => {
  const t = target.trim();
  if (isIp(t)) {
    return {
      target: t,
      type: 'ip',
      source: 'browser-doh',
      checks: {
        domainStatus: { name: 'IP target', status: 'pass', detail: t },
        dnsRecords: { name: 'DNS records', status: 'skip', detail: 'Limited IP lookup in browser mode' },
        blacklist: { name: 'Blacklist', status: 'skip', detail: 'Placeholder — connect local API + MXToolbox' },
        ipReputation: { name: 'IP reputation', status: 'skip', detail: 'Placeholder — AbuseIPDB / VirusTotal' }
      },
      summary: { pass: 1, warn: 0, fail: 0, skip: 2 }
    };
  }

  const [mxAns, txtAns, dmarcAns, aAns] = await Promise.all([
    dohQuery(t, 'MX'),
    dohQuery(t, 'TXT'),
    dohQuery(`_dmarc.${t}`, 'TXT'),
    dohQuery(t, 'A')
  ]);

  const mx = mxAns.map((a) => a.data);
  const txt = txtAns.map((a) => a.data.replace(/"/g, ''));
  const dmarc = dmarcAns.map((a) => a.data.replace(/"/g, ''));
  const spf = txt.filter((r) => r.toLowerCase().startsWith('v=spf1'));
  const dmarcRec = dmarc.filter((r) => r.toLowerCase().startsWith('v=dmarc1'));

  const checks = {
    domainStatus: {
      name: 'Domain status',
      status: aAns.length ? 'pass' : 'fail',
      detail: aAns.length ? 'Domain resolves' : 'No A records'
    },
    dnsRecords: {
      name: 'DNS records',
      status: aAns.length ? 'pass' : 'warn',
      detail: `A: ${aAns.map((a) => a.data).join(', ') || 'none'}`
    },
    mx: {
      name: 'MX records',
      status: mx.length ? 'pass' : 'fail',
      detail: mx.join(' · ') || 'No MX records'
    },
    spf: {
      name: 'SPF',
      status: spf.length ? 'pass' : 'warn',
      detail: spf[0] || 'No SPF TXT record'
    },
    dkim: {
      name: 'DKIM',
      status: 'skip',
      detail: 'Placeholder — add selector in config for full DKIM check'
    },
    dmarc: {
      name: 'DMARC',
      status: dmarcRec.length ? 'pass' : 'warn',
      detail: dmarcRec[0] || 'No DMARC record'
    },
    blacklist: {
      name: 'Blacklist',
      status: 'skip',
      detail: 'Placeholder — use local API with MXTOOLBOX_API_KEY'
    },
    ssl: {
      name: 'SSL certificate',
      status: 'warn',
      detail: 'Browser mode — use local API for HTTPS probe'
    },
    ipReputation: {
      name: 'IP reputation',
      status: 'skip',
      detail: 'Placeholder — AbuseIPDB / VirusTotal'
    }
  };

  const summary = Object.values(checks).reduce(
    (acc, c) => {
      acc[c.status === 'pass' ? 'pass' : c.status === 'fail' ? 'fail' : c.status === 'skip' ? 'skip' : 'warn'] += 1;
      return acc;
    },
    { pass: 0, warn: 0, fail: 0, skip: 0 }
  );

  return { target: t, type: 'domain', source: 'browser-doh', checks, summary };
};

export const runDomainCheck = async (target) => {
  if (isApiAvailable()) {
    const result = await apiPost('/api/domain/check', { target });
    return formatApiDomainResult(result);
  }
  return runDomainCheckBrowser(target);
};

const formatApiDomainResult = (result) => {
  const checks = result.checks || {};
  const entries = Object.entries(checks).map(([key, val]) => ({
    name: key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()),
    status: val.status || (val.passed ? 'pass' : val.passed === false ? 'fail' : val.skipped ? 'skip' : 'warn'),
    detail: val.note || val.records?.join?.(', ') || JSON.stringify(val.records || val) || result.summary
  }));

  if (result.suite) {
    result.suite.forEach((s) => {
      entries.push({
        name: (s.lookupType || 'check').toUpperCase(),
        status: s.critical ? 'fail' : s.warning ? 'warn' : 'pass',
        detail: s.summary
      });
    });
  }

  const summary = entries.reduce(
    (acc, c) => {
      acc[c.status === 'pass' ? 'pass' : c.status === 'fail' ? 'fail' : c.status === 'skip' ? 'skip' : 'warn'] += 1;
      return acc;
    },
    { pass: 0, warn: 0, fail: 0, skip: 0 }
  );

  return {
    target: result.target,
    type: result.type,
    source: result.source,
    checks: Object.fromEntries(entries.map((e, i) => [`item-${i}`, e])),
    summary,
    raw: result
  };
};

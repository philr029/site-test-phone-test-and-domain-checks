/**
 * Shared domain/IP check logic — used by CLI scripts and dashboard API.
 */
import dns from 'node:dns/promises';
import net from 'node:net';

const DOH_URL = 'https://dns.google/resolve';

const pingSmtp = (host) =>
  new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (reachable) => {
      socket.destroy();
      resolve(reachable);
    };
    socket.setTimeout(3000);
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    socket.once('timeout', () => done(false));
    socket.connect(25, host);
  });

const toCheckResult = (status, records = [], raw = null) => ({ status, records, raw });

const statusFromMxToolboxCode = (code) => {
  if (code === 'ISSUE') return 'fail';
  if (code === 'WARNING') return 'warn';
  if (code === 'CLEAN') return 'pass';
  return 'skip';
};

const dohLookup = async (name, type) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(
      `${DOH_URL}?name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`,
      {
        headers: { Accept: 'application/dns-json' },
        signal: controller.signal
      }
    );

    if (!response.ok) {
      throw new Error(`DoH lookup failed with status ${response.status}`);
    }

    const raw = await response.json();
    const answers = Array.isArray(raw?.Answer) ? raw.Answer : [];
    return { answers, raw };
  } finally {
    clearTimeout(timeout);
  }
};

const queryMxRecords = async (domain) => {
  try {
    const { answers, raw } = await dohLookup(domain, 'MX');
    const records = answers
      .map((answer) => String(answer?.data || '').trim())
      .filter(Boolean)
      .map((value) => value.replace(/\.$/, ''));
    return { records, raw: { source: 'doh', response: raw } };
  } catch (dohError) {
    try {
      const records = await dns.resolveMx(domain);
      const normalized = records.map((record) => `${record.priority} ${String(record.exchange || '').replace(/\.$/, '')}`);
      return { records: normalized, raw: { source: 'dns', response: records } };
    } catch (dnsError) {
      return {
        records: [],
        raw: {
          source: 'dns',
          error: dnsError.message,
          dohError: dohError.message
        }
      };
    }
  }
};

const queryTxtRecords = async (name) => {
  try {
    const { answers, raw } = await dohLookup(name, 'TXT');
    const records = answers
      .map((answer) => String(answer?.data || '').replace(/^"|"$/g, '').trim())
      .filter(Boolean);
    return { records, raw: { source: 'doh', response: raw } };
  } catch (dohError) {
    try {
      const response = await dns.resolveTxt(name);
      const records = response.map((chunks) => chunks.join(''));
      return { records, raw: { source: 'dns', response } };
    } catch (dnsError) {
      return {
        records: [],
        raw: {
          source: 'dns',
          error: dnsError.message,
          dohError: dohError.message
        }
      };
    }
  }
};

export const checkMx = async (domain) => {
  const { records, raw } = await queryMxRecords(domain);
  return toCheckResult(records.length > 0 ? 'pass' : 'fail', records, raw);
};

export const checkSpf = async (domain) => {
  const { records, raw } = await queryTxtRecords(domain);
  const spf = records.filter((record) => record.toLowerCase().startsWith('v=spf1'));
  return toCheckResult(spf.length > 0 ? 'pass' : 'warn', spf, raw);
};

export const checkDkim = async (domain, selector) => {
  if (!selector) {
    return toCheckResult('skip', [], {
      source: 'placeholder',
      note: 'DKIM selector not configured. Set domain.dkimSelector to enable DNS checks.'
    });
  }

  const { records, raw } = await queryTxtRecords(`${selector}._domainkey.${domain}`);
  const dkim = records.filter((record) => record.toLowerCase().startsWith('v=dkim1'));
  return toCheckResult(dkim.length > 0 ? 'pass' : 'warn', dkim, {
    ...raw,
    selector
  });
};

export const checkDmarc = async (domain) => {
  const { records, raw } = await queryTxtRecords(`_dmarc.${domain}`);
  const dmarc = records.filter((record) => record.toLowerCase().startsWith('v=dmarc1'));
  return toCheckResult(dmarc.length > 0 ? 'pass' : 'warn', dmarc, raw);
};

export const checkBlacklistPlaceholder = async (target) =>
  toCheckResult('skip', [], {
    source: 'placeholder',
    target,
    note: 'Blacklist placeholder — connect external blacklist provider.'
  });

export const checkIpReputationPlaceholder = async (target) =>
  toCheckResult('skip', [], {
    source: 'placeholder',
    target,
    note: 'IP reputation placeholder — connect AbuseIPDB or VirusTotal.'
  });

const checkDnsResolution = async (domain) => {
  const [aResult, nsResult] = await Promise.allSettled([dns.resolve4(domain), dns.resolveNs(domain)]);
  const aRecords = aResult.status === 'fulfilled' ? aResult.value : [];
  const nsRecords = nsResult.status === 'fulfilled' ? nsResult.value : [];
  const records = [
    ...aRecords.map((value) => `A ${value}`),
    ...nsRecords.map((value) => `NS ${value}`)
  ];
  return toCheckResult(records.length > 0 ? 'pass' : 'warn', records, {
    source: 'dns',
    aRecords,
    nsRecords,
    errors: {
      a: aResult.status === 'rejected' ? aResult.reason?.message : null,
      ns: nsResult.status === 'rejected' ? nsResult.reason?.message : null
    }
  });
};

const checkSmtpReachability = async (mxCheckResult) => {
  const firstMx = mxCheckResult.records[0];
  const host = String(firstMx || '').split(' ').slice(1).join(' ').trim();
  if (!host) {
    return toCheckResult('warn', [], {
      source: 'smtp-probe',
      note: 'No MX host available for SMTP probe.'
    });
  }

  const reachable = await pingSmtp(host);
  return toCheckResult(reachable ? 'pass' : 'warn', [host], {
    source: 'smtp-probe',
    host,
    reachable
  });
};

export const callMxToolbox = async (lookupType, target, apiKey) => {
  const url = `https://api.mxtoolbox.com/api/v1/lookup/${lookupType}/${encodeURIComponent(target)}`;
  const response = await fetch(url, {
    headers: {
      Authorization: apiKey,
      Accept: 'application/json'
    }
  });
  if (!response.ok) {
    throw new Error(`MXToolbox ${lookupType} lookup failed with status ${response.status}`);
  }
  return response.json();
};

export const parseMxToolboxStatus = (payload, lookupType) => {
  const failedRecords = payload?.Failed || payload?.failed || [];
  const warnings = payload?.Warnings || payload?.warnings || [];
  const informational = payload?.Information || payload?.information || [];
  const critical = failedRecords.length > 0;
  const warning = !critical && warnings.length > 0;

  return {
    source: 'mxtoolbox-api',
    lookupType,
    critical,
    warning,
    summary:
      failedRecords.length > 0
        ? `${lookupType.toUpperCase()} issue detected`
        : warning
          ? `${lookupType.toUpperCase()} warning detected`
          : `${lookupType.toUpperCase()} clean`,
    statusCode: critical ? 'ISSUE' : warning ? 'WARNING' : 'CLEAN',
    check: toCheckResult(
      critical ? 'fail' : warning ? 'warn' : 'pass',
      [...failedRecords, ...warnings, ...informational],
      payload
    )
  };
};

export const fallbackDomainCheck = async (domain, options = {}) => {
  const [mx, spf, dkim, dmarc, dnsRecords] = await Promise.all([
    checkMx(domain),
    checkSpf(domain),
    checkDkim(domain, options.dkimSelector),
    checkDmarc(domain),
    checkDnsResolution(domain)
  ]);

  const smtpReachable = await checkSmtpReachability(mx);
  const blacklist = await checkBlacklistPlaceholder(domain);
  const ipReputation = await checkIpReputationPlaceholder(domain);

  const issues = [];
  if (mx.status === 'fail') issues.push('No MX records found');
  if (spf.status !== 'pass') issues.push('No SPF record found');
  if (dmarc.status !== 'pass') issues.push('No DMARC record found');

  const critical = mx.status === 'fail';

  return {
    source: 'fallback-dns',
    critical,
    warning: issues.length > 0 && !critical,
    summary: issues.length ? issues.join('; ') : 'DNS checks clean',
    statusCode: critical ? 'ISSUE' : issues.length ? 'WARNING' : 'CLEAN',
    checks: {
      domainStatus: toCheckResult(dnsRecords.status === 'pass' ? 'pass' : 'fail', dnsRecords.records, dnsRecords.raw),
      dnsRecords,
      mx,
      spf,
      dkim,
      dmarc,
      blacklist,
      ssl: toCheckResult('skip', [], { source: 'placeholder', note: 'SSL checked separately via HTTPS probe.' }),
      ipReputation,
      smtpReachable
    },
    dns: {
      mx: mx.records,
      txt: { spf: spf.records, dmarc: dmarc.records, dkim: dkim.records },
      dnsRecords: dnsRecords.records
    }
  };
};

export const fallbackIpCheck = async (ip) => {
  const [reverseResult, forwardResult, blacklist, ipReputation] = await Promise.all([
    dns.reverse(ip),
    dns.lookup(ip),
    checkBlacklistPlaceholder(ip),
    checkIpReputationPlaceholder(ip)
  ]);

  const ptrRecords = Array.isArray(reverseResult) ? reverseResult : [];
  const hasPtr = ptrRecords.length > 0;

  return {
    source: 'fallback-dns',
    critical: false,
    warning: !hasPtr,
    summary: hasPtr ? 'PTR record present' : 'No PTR record found',
    statusCode: hasPtr ? 'CLEAN' : 'WARNING',
    checks: {
      domainStatus: toCheckResult('pass', [ip], { note: 'IP target' }),
      dnsRecords: toCheckResult(forwardResult?.address ? 'pass' : 'warn', forwardResult?.address ? [forwardResult.address] : [], {
        source: 'dns',
        forward: forwardResult || null
      }),
      reverseLookup: toCheckResult(hasPtr ? 'pass' : 'warn', ptrRecords, {
        source: 'dns',
        reverse: ptrRecords
      }),
      blacklist,
      ipReputation
    }
  };
};

export const probeSsl = async (domain) => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(`https://${domain}`, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow'
    });
    clearTimeout(timeout);

    return toCheckResult(res.ok || res.status < 500 ? 'pass' : 'warn', [`HTTPS ${res.status}`], {
      url: `https://${domain}`,
      statusCode: res.status,
      ok: res.ok
    });
  } catch (error) {
    return toCheckResult('fail', [], {
      url: `https://${domain}`,
      error: error.message || 'SSL/HTTPS probe failed'
    });
  }
};

export const runTargetCheck = async (input, env = process.env) => {
  const target = String(input || '').trim();
  const isIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(target) || target.includes(':');
  const apiKey = env.MXTOOLBOX_API_KEY;
  const dkimSelector = env.DOMAIN_DKIM_SELECTOR;

  let result;
  if (apiKey && !isIp) {
    const suite = [];
    const checks = {
      domainStatus: toCheckResult('skip', [], { source: 'mxtoolbox-api', note: 'Domain resolution not included in API suite.' }),
      dnsRecords: toCheckResult('skip', [], { source: 'mxtoolbox-api', note: 'DNS records not included in API suite.' })
    };

    for (const lookupType of ['mx', 'spf', 'dmarc', 'blacklist']) {
      try {
        const payload = await callMxToolbox(lookupType, target, apiKey);
        const parsed = parseMxToolboxStatus(payload, lookupType);
        suite.push(parsed);
        checks[lookupType] = parsed.check;
      } catch (error) {
        const fallbackCheck = toCheckResult('warn', [], {
          source: 'mxtoolbox-api',
          lookupType,
          error: error.message
        });

        suite.push({
          lookupType,
          critical: false,
          warning: true,
          statusCode: 'WARNING',
          summary: `${lookupType} lookup failed: ${error.message}`,
          check: fallbackCheck
        });
        checks[lookupType] = fallbackCheck;
      }
    }

    checks.dkim = await checkDkim(target, dkimSelector);
    checks.ipReputation = await checkIpReputationPlaceholder(target);

    const critical = suite.some((e) => e.critical);
    const warning = suite.some((e) => e.warning);
    result = {
      target,
      type: 'domain',
      source: 'mxtoolbox-api',
      critical,
      warning,
      statusCode: critical ? 'ISSUE' : warning ? 'WARNING' : 'CLEAN',
      summary: critical ? 'MXToolbox reported issues' : warning ? 'MXToolbox warnings' : 'MXToolbox clean',
      suite,
      checks
    };
  } else {
    result = isIp
      ? { target, type: 'ip', ...(await fallbackIpCheck(target)) }
      : { target, type: 'domain', ...(await fallbackDomainCheck(target, { dkimSelector })) };
  }

  if (!isIp && result.checks) {
    result.checks.ssl = await probeSsl(target);
  }

  return {
    ...result,
    checkedAt: new Date().toISOString(),
    usedApi: Boolean(apiKey && !isIp)
  };
};

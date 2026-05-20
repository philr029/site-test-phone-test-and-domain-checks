/**
 * Shared domain/IP check logic — used by CLI scripts and dashboard API.
 */
import dns from 'node:dns/promises';
import net from 'node:net';

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
    statusCode: critical ? 'ISSUE' : warning ? 'WARNING' : 'CLEAN'
  };
};

export const fallbackDomainCheck = async (domain) => {
  const [mxResult, nsResult, aResult, txtResult, dmarcResult] = await Promise.allSettled([
    dns.resolveMx(domain),
    dns.resolveNs(domain),
    dns.resolve4(domain),
    dns.resolveTxt(domain),
    dns.resolveTxt(`_dmarc.${domain}`)
  ]);

  const mx = mxResult.status === 'fulfilled' ? mxResult.value : [];
  const ns = nsResult.status === 'fulfilled' ? nsResult.value : [];
  const aRecords = aResult.status === 'fulfilled' ? aResult.value : [];
  const txt =
    txtResult.status === 'fulfilled'
      ? txtResult.value.map((chunks) => chunks.join(''))
      : [];
  const dmarcTxt =
    dmarcResult.status === 'fulfilled'
      ? dmarcResult.value.map((chunks) => chunks.join(''))
      : [];

  const spfRecords = txt.filter((record) => record.toLowerCase().startsWith('v=spf1'));
  const dmarcRecords = dmarcTxt.filter((record) => record.toLowerCase().startsWith('v=dmarc1'));

  let smtpReachable = false;
  if (mx.length > 0) {
    smtpReachable = await pingSmtp(mx[0].exchange);
  }

  const issues = [];
  if (mx.length === 0) issues.push('No MX records found');
  if (spfRecords.length === 0) issues.push('No SPF record found');
  if (dmarcRecords.length === 0) issues.push('No DMARC record found');

  const critical = issues.some((issue) => issue.includes('MX'));

  return {
    source: 'fallback-dns',
    critical,
    warning: issues.length > 0 && !critical,
    summary: issues.length ? issues.join('; ') : 'DNS checks clean',
    statusCode: critical ? 'ISSUE' : issues.length ? 'WARNING' : 'CLEAN',
    checks: {
      domainStatus: { passed: aRecords.length > 0 || ns.length > 0, status: aRecords.length || ns.length ? 'pass' : 'fail' },
      dnsRecords: { passed: ns.length > 0 || aRecords.length > 0, records: { ns, a: aRecords }, status: ns.length || aRecords.length ? 'pass' : 'warn' },
      mx: { passed: mx.length > 0, records: mx, status: mx.length ? 'pass' : 'fail' },
      spf: { passed: spfRecords.length > 0, records: spfRecords, status: spfRecords.length ? 'pass' : 'warn' },
      dkim: {
        passed: null,
        skipped: true,
        status: 'skip',
        note: 'DKIM placeholder — add domain.dkimSelector when known.'
      },
      dmarc: { passed: dmarcRecords.length > 0, records: dmarcRecords, status: dmarcRecords.length ? 'pass' : 'warn' },
      blacklist: {
        passed: null,
        skipped: true,
        status: 'skip',
        note: 'Blacklist status placeholder — configure MXTOOLBOX_API_KEY or AbuseIPDB.'
      },
      ssl: { passed: null, skipped: true, status: 'skip', note: 'SSL checked separately via HTTPS probe.' },
      ipReputation: {
        passed: null,
        skipped: true,
        status: 'skip',
        note: 'IP reputation placeholder — configure AbuseIPDB or VirusTotal API keys.'
      },
      smtpReachable: { passed: smtpReachable, status: smtpReachable ? 'pass' : 'warn' }
    },
    dns: { mx, ns, aRecords, txt, dmarc: dmarcRecords }
  };
};

export const fallbackIpCheck = async (ip) => {
  const [reverseResult, forwardResult] = await Promise.allSettled([
    dns.reverse(ip),
    dns.lookup(ip)
  ]);

  const reverse =
    reverseResult.status === 'fulfilled'
      ? reverseResult.value
      : { error: reverseResult.reason?.message, value: [] };
  const forward =
    forwardResult.status === 'fulfilled'
      ? forwardResult.value
      : { error: forwardResult.reason?.message };

  const hasPtr = Array.isArray(reverse) ? reverse.length > 0 : reverse.value?.length > 0;
  const ptrRecords = Array.isArray(reverse) ? reverse : reverse.value || [];

  return {
    source: 'fallback-dns',
    critical: false,
    warning: !hasPtr,
    summary: hasPtr ? 'PTR record present' : 'No PTR record found',
    statusCode: hasPtr ? 'CLEAN' : 'WARNING',
    checks: {
      domainStatus: { passed: true, status: 'pass', note: 'IP target' },
      dnsRecords: {
        passed: Boolean(forward?.address),
        address: forward?.address || null,
        status: forward?.address ? 'pass' : 'warn'
      },
      reverseLookup: { passed: hasPtr, records: ptrRecords, status: hasPtr ? 'pass' : 'warn' },
      blacklist: { passed: null, skipped: true, status: 'skip', note: 'Blacklist placeholder' },
      ipReputation: { passed: null, skipped: true, status: 'skip', note: 'IP reputation placeholder' }
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
    return {
      passed: res.ok || res.status < 500,
      status: res.ok ? 'pass' : 'warn',
      statusCode: res.status,
      note: `HTTPS responded with ${res.status}`
    };
  } catch (error) {
    return {
      passed: false,
      status: 'fail',
      note: error.message || 'SSL/HTTPS probe failed'
    };
  }
};

export const runTargetCheck = async (input, env = process.env) => {
  const target = String(input || '').trim();
  const isIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(target) || target.includes(':');
  const apiKey = env.MXTOOLBOX_API_KEY;

  let result;
  if (apiKey && !isIp) {
    const suite = [];
    for (const lookupType of ['mx', 'spf', 'dmarc', 'blacklist']) {
      try {
        const payload = await callMxToolbox(lookupType, target, apiKey);
        suite.push(parseMxToolboxStatus(payload, lookupType));
      } catch (error) {
        suite.push({
          lookupType,
          critical: false,
          warning: true,
          statusCode: 'WARNING',
          summary: `${lookupType} lookup failed: ${error.message}`
        });
      }
    }
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
      suite
    };
  } else {
    result = isIp
      ? { target, type: 'ip', ...(await fallbackIpCheck(target)) }
      : { target, type: 'domain', ...(await fallbackDomainCheck(target)) };
  }

  if (!isIp && result.checks) {
    const ssl = await probeSsl(target);
    result.checks.ssl = ssl;
  }

  return {
    ...result,
    checkedAt: new Date().toISOString(),
    usedApi: Boolean(apiKey && !isIp)
  };
};

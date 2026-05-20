import fs from 'node:fs/promises';
import path from 'node:path';
import dns from 'node:dns/promises';
import net from 'node:net';
import dotenv from 'dotenv';
import { flattenMxTargets, getSelectedTargets } from './config/target-loader.js';
import { sendNotification } from './utils/notifier.js';

dotenv.config();

const repoRoot = process.cwd();
const reportPath = path.join(repoRoot, 'reports', 'domain-health-report.json');
const cachePath = path.join(repoRoot, 'data', 'health_cache.json');

const SKIP_MX_MESSAGE =
  'Skipped MXToolbox API check because MXTOOLBOX_API_KEY is missing. Used fallback DNS checks instead.';

const isPlaceholderDomain = (value) => {
  const normalized = String(value || '').toLowerCase();
  return normalized === 'example.com' || normalized.endsWith('.example.com');
};

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

const callMxToolbox = async (lookupType, target) => {
  const url = `https://api.mxtoolbox.com/api/v1/lookup/${lookupType}/${encodeURIComponent(target)}`;
  const response = await fetch(url, {
    headers: {
      Authorization: process.env.MXTOOLBOX_API_KEY,
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`MXToolbox ${lookupType} lookup failed with status ${response.status}`);
  }

  return response.json();
};

const parseMxToolboxStatus = (payload, lookupType) => {
  const failedRecords = payload?.Failed || payload?.failed || [];
  const warnings = payload?.Warnings || payload?.warnings || [];

  const critical = failedRecords.length > 0;
  const warning = !critical && warnings.length > 0;

  return {
    source: 'mxtoolbox-api',
    lookupType,
    raw: payload,
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

const resolveTxt = async (name) => {
  try {
    const records = await dns.resolveTxt(name);
    return records.map((chunks) => chunks.join(''));
  } catch (error) {
    return { error: error.message, records: [] };
  }
};

const fallbackDomainCheck = async (domain) => {
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
      mx: { passed: mx.length > 0, records: mx },
      spf: { passed: spfRecords.length > 0, records: spfRecords },
      dmarc: { passed: dmarcRecords.length > 0, records: dmarcRecords },
      dkim: {
        passed: null,
        skipped: true,
        note: 'DKIM requires a selector in config — add domain.dkimSelector when known.'
      },
      dnsResolution: { passed: aRecords.length > 0 || ns.length > 0, aRecords, ns },
      smtpReachable
    },
    dns: {
      mx,
      ns,
      aRecords,
      txt,
      dmarc: dmarcRecords
    }
  };
};

const fallbackIpCheck = async (ip) => {
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
      reverseLookup: { passed: hasPtr, records: ptrRecords },
      dnsResolution: {
        passed: Boolean(forward?.address),
        address: forward?.address || null,
        error: forward?.error || null
      }
    }
  };
};

const runMxToolboxSuite = async (item) => {
  const lookupTypes = item.type === 'domain' ? ['mx', 'spf', 'dmarc', 'blacklist'] : ['blacklist'];
  const suite = [];

  for (const lookupType of lookupTypes) {
    try {
      const payload = await callMxToolbox(lookupType, item.target);
      suite.push(parseMxToolboxStatus(payload, lookupType));
    } catch (error) {
      suite.push({
        source: 'mxtoolbox-api',
        lookupType,
        critical: false,
        warning: true,
        summary: `${lookupType} lookup failed`,
        statusCode: 'WARNING',
        error: error.message
      });
    }
  }

  if (item.type === 'domain') {
    suite.push({
      source: 'mxtoolbox-api',
      lookupType: 'dkim',
      critical: false,
      warning: false,
      statusCode: 'SKIPPED',
      summary: 'DKIM placeholder — configure domain.dkimSelector for selector-based DKIM checks'
    });
  }

  const critical = suite.some((entry) => entry.critical);
  const warning = suite.some((entry) => entry.warning || entry.statusCode === 'WARNING');

  return {
    source: 'mxtoolbox-api',
    critical,
    warning,
    summary: critical ? 'MXToolbox reported critical issues' : warning ? 'MXToolbox reported warnings' : 'MXToolbox checks clean',
    statusCode: critical ? 'ISSUE' : warning ? 'WARNING' : 'CLEAN',
    suite
  };
};

const readCache = async () => {
  try {
    const raw = await fs.readFile(cachePath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed?.entries || {};
  } catch {
    return {};
  }
};

const writeCache = async (entries) => {
  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  await fs.writeFile(
    cachePath,
    JSON.stringify({ updatedAt: new Date().toISOString(), entries }, null, 2),
    'utf8'
  );
};

const run = async () => {
  const { environment, targets } = await getSelectedTargets();
  const targetChecks = flattenMxTargets(targets);
  const checks = [];
  const hasApiKey = Boolean(process.env.MXTOOLBOX_API_KEY);

  if (targetChecks.length === 0) {
    const emptyReport = {
      generatedAt: new Date().toISOString(),
      environment,
      usedMxToolboxApi: hasApiKey,
      skippedReason: 'No domain targets enabled in config/targets.json',
      checks: [],
      status: 'skipped'
    };
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(emptyReport, null, 2), 'utf8');
    console.log(JSON.stringify(emptyReport));
    return;
  }

  for (const item of targetChecks) {
    if (item.type === 'domain' && isPlaceholderDomain(item.target) && process.env.ALLOW_PLACEHOLDER_TARGETS !== 'true') {
      checks.push({
        ...item,
        source: 'config',
        critical: false,
        warning: false,
        statusCode: 'SKIPPED',
        summary: 'Placeholder domain skipped',
        skippedReason: 'example.com is a demo placeholder. Replace domain in config/targets.json or set ALLOW_PLACEHOLDER_TARGETS=true.',
        recommendedNextAction: 'Set domain.domain to your real domain name.'
      });
      continue;
    }

    try {
      const check = hasApiKey
        ? await runMxToolboxSuite(item)
        : item.type === 'domain'
        ? await fallbackDomainCheck(item.target)
        : await fallbackIpCheck(item.target);

      checks.push({
        ...item,
        ...check,
        skippedMxToolboxApi: !hasApiKey,
        skippedReason: !hasApiKey ? SKIP_MX_MESSAGE : null,
        recommendedNextAction: check.critical
          ? 'Investigate DNS/email configuration immediately.'
          : check.warning
          ? 'Review warnings and confirm whether they are acceptable.'
          : 'No action required.'
      });
    } catch (error) {
      const fallback =
        item.type === 'domain'
          ? await fallbackDomainCheck(item.target)
          : await fallbackIpCheck(item.target);

      checks.push({
        ...item,
        ...fallback,
        error: error.message,
        skippedMxToolboxApi: !hasApiKey,
        skippedReason: !hasApiKey ? SKIP_MX_MESSAGE : null
      });
    }
  }

  const previous = await readCache();
  const current = {};
  const deltas = [];

  for (const check of checks) {
    const key = `${check.type}:${check.target}`;
    const snapshot = {
      statusCode: check.statusCode,
      summary: check.summary,
      critical: check.critical,
      sourceTarget: check.sourceTarget
    };

    current[key] = snapshot;

    const prev = previous[key];
    if (!prev) continue;

    if (prev.statusCode !== snapshot.statusCode || prev.summary !== snapshot.summary) {
      deltas.push({
        key,
        target: check.target,
        type: check.type,
        sourceTarget: check.sourceTarget,
        previous: prev,
        current: snapshot,
        changedAt: new Date().toISOString()
      });
    }
  }

  await writeCache(current);

  const alerts = deltas.filter((delta) => delta.current.critical || delta.previous.critical);
  const hasCritical = checks.some((check) => check.critical);

  const report = {
    generatedAt: new Date().toISOString(),
    environment,
    usedMxToolboxApi: hasApiKey,
    skippedMxToolboxMessage: hasApiKey ? null : SKIP_MX_MESSAGE,
    checks,
    deltas,
    alerts,
    status: hasCritical ? 'failed' : 'passed',
    summary: hasApiKey
      ? 'MXToolbox API checks completed'
      : SKIP_MX_MESSAGE
  };

  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');

  for (const alert of alerts) {
    await sendNotification({
      title: 'Domain/IP Health Delta Detected',
      environment,
      targetName: alert.sourceTarget,
      details: `${alert.target} changed from ${alert.previous.statusCode} to ${alert.current.statusCode} (${alert.current.summary})`,
      timestamp: alert.changedAt
    }).catch(() => {});
  }

  if (report.status === 'failed') {
    process.exitCode = 1;
  }

  console.log(JSON.stringify(report));
};

run();

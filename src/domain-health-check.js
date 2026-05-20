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

const callMxToolbox = async (target) => {
  const url = `https://api.mxtoolbox.com/api/v1/lookup/blacklist/${encodeURIComponent(target)}`;
  const response = await fetch(url, {
    headers: {
      Authorization: process.env.MXTOOLBOX_API_KEY,
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`MXToolbox API failed with status ${response.status}`);
  }

  const payload = await response.json();
  const failedRecords = payload?.Failed || payload?.failed || [];

  return {
    source: 'mxtoolbox-api',
    raw: payload,
    critical: failedRecords.length > 0,
    summary:
      failedRecords.length > 0
        ? `Blacklisted on ${failedRecords.map((entry) => entry.Name || entry.Blacklist).join(', ')}`
        : 'Clean',
    statusCode: failedRecords.length > 0 ? 'BLACKLISTED' : 'CLEAN'
  };
};

const fallbackDomainCheck = async (domain) => {
  const [mxResult, nsResult] = await Promise.allSettled([dns.resolveMx(domain), dns.resolveNs(domain)]);

  const mx = mxResult.status === 'fulfilled' ? mxResult.value : [];
  const ns = nsResult.status === 'fulfilled' ? nsResult.value : [];
  const resolutionError = mxResult.status === 'rejected' || nsResult.status === 'rejected';

  let smtpReachable = false;
  if (mx.length > 0) {
    smtpReachable = await pingSmtp(mx[0].exchange);
  }

  const critical = !resolutionError && (mx.length === 0 || ns.length === 0);

  return {
    source: 'fallback-dns',
    critical,
    summary: resolutionError
      ? 'DNS fallback partially unavailable in runtime'
      : critical
      ? 'Missing MX or NS records'
      : 'Clean',
    statusCode: critical ? 'BLACKLISTED' : 'CLEAN',
    dns: {
      mx,
      ns,
      smtpReachable,
      resolutionError: resolutionError
        ? {
            mx: mxResult.status === 'rejected' ? mxResult.reason?.message : null,
            ns: nsResult.status === 'rejected' ? nsResult.reason?.message : null
          }
        : null
    }
  };
};

const fallbackIpCheck = async (ip) => {
  const reverseResult = await dns.reverse(ip).then(
    (value) => ({ value, error: null }),
    (error) => ({ value: [], error: error.message })
  );

  const hasPtr = reverseResult.value.length > 0;

  return {
    source: 'fallback-dns',
    critical: false,
    summary: hasPtr ? 'Clean' : reverseResult.error ? 'PTR lookup unavailable in runtime' : 'No PTR record found',
    statusCode: hasPtr ? 'CLEAN' : 'UNKNOWN',
    dns: {
      reverse: reverseResult.value,
      resolutionError: reverseResult.error
    }
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

  for (const item of targetChecks) {
    try {
      const check = process.env.MXTOOLBOX_API_KEY
        ? await callMxToolbox(item.target)
        : item.type === 'domain'
        ? await fallbackDomainCheck(item.target)
        : await fallbackIpCheck(item.target);
      checks.push({ ...item, ...check });
    } catch (error) {
      const fallback = item.type === 'domain' ? await fallbackDomainCheck(item.target) : await fallbackIpCheck(item.target);
      checks.push({ ...item, ...fallback, error: error.message });
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

  const report = {
    generatedAt: new Date().toISOString(),
    environment,
    usedMxToolboxApi: Boolean(process.env.MXTOOLBOX_API_KEY),
    checks,
    deltas,
    alerts,
    status: alerts.length > 0 ? 'failed' : 'passed'
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

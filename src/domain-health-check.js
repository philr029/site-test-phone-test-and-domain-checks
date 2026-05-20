import fs from 'node:fs/promises';
import path from 'node:path';
import dns from 'node:dns/promises';
import net from 'node:net';
import dotenv from 'dotenv';

dotenv.config();

const repoRoot = process.cwd();
const reportPath = path.join(repoRoot, 'reports', 'domain-health-report.json');

const parseCsv = (value) =>
  (value || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

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

const getTargets = async () => {
  const configPath = path.join(repoRoot, 'config', 'domain-targets.json');
  const file = JSON.parse(await fs.readFile(configPath, 'utf8'));

  return {
    domains: parseCsv(process.env.DOMAIN_TARGETS).length
      ? parseCsv(process.env.DOMAIN_TARGETS)
      : file.domains,
    ips: parseCsv(process.env.IP_TARGETS).length ? parseCsv(process.env.IP_TARGETS) : file.ips
  };
};

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
  const failedRecords = (payload?.Failed || payload?.failed || []).length;

  return {
    source: 'mxtoolbox-api',
    raw: payload,
    critical: failedRecords > 0,
    summary: failedRecords > 0 ? `${failedRecords} blacklist findings` : 'No blacklist findings'
  };
};

const fallbackDomainCheck = async (domain) => {
  const [mxResult, nsResult] = await Promise.allSettled([
    dns.resolveMx(domain),
    dns.resolveNs(domain)
  ]);

  const mx = mxResult.status === 'fulfilled' ? mxResult.value : [];
  const ns = nsResult.status === 'fulfilled' ? nsResult.value : [];
  const resolutionError =
    mxResult.status === 'rejected' || nsResult.status === 'rejected';

  let smtpReachable = false;
  if (mx.length > 0) {
    smtpReachable = await pingSmtp(mx[0].exchange);
  }

  const critical = !resolutionError && (mx.length === 0 || ns.length === 0);

  return {
    source: 'fallback-dns',
    critical,
    summary: resolutionError
      ? 'DNS fallback could not fully resolve records in this runtime'
      : critical
      ? 'Missing MX or NS records'
      : 'DNS records are present',
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
  return {
    source: 'fallback-dns',
    critical: false,
    summary: reverseResult.value.length
      ? 'PTR record found'
      : reverseResult.error
      ? 'PTR lookup unavailable in this runtime'
      : 'No PTR record found',
    dns: {
      reverse: reverseResult.value,
      resolutionError: reverseResult.error
    }
  };
};

const sendAlert = async (alerts) => {
  if (alerts.length === 0) return;

  console.error(`ALERT: ${alerts.length} critical domain health finding(s)`);
  console.error(JSON.stringify(alerts, null, 2));

  if (!process.env.ALERT_WEBHOOK_URL) return;

  await fetch(process.env.ALERT_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: 'Domain health monitor detected critical findings',
      alerts
    })
  }).catch(() => {});
};

const run = async () => {
  const targets = await getTargets();
  const checks = [];

  for (const domain of targets.domains) {
    try {
      const check = process.env.MXTOOLBOX_API_KEY
        ? await callMxToolbox(domain)
        : await fallbackDomainCheck(domain);
      checks.push({ target: domain, type: 'domain', ...check });
    } catch (error) {
      const fallback = await fallbackDomainCheck(domain).catch(() => ({
        source: 'fallback-dns',
        critical: true,
        summary: 'Fallback DNS check failed',
        error: error.message
      }));
      checks.push({ target: domain, type: 'domain', ...fallback });
    }
  }

  for (const ip of targets.ips) {
    try {
      const check = process.env.MXTOOLBOX_API_KEY
        ? await callMxToolbox(ip)
        : await fallbackIpCheck(ip);
      checks.push({ target: ip, type: 'ip', ...check });
    } catch (error) {
      const fallback = await fallbackIpCheck(ip).catch(() => ({
        source: 'fallback-dns',
        critical: true,
        summary: 'Fallback IP check failed',
        error: error.message
      }));
      checks.push({ target: ip, type: 'ip', ...fallback });
    }
  }

  const alerts = checks.filter((item) => item.critical);
  const report = {
    generatedAt: new Date().toISOString(),
    usedMxToolboxApi: Boolean(process.env.MXTOOLBOX_API_KEY),
    checks,
    alerts,
    status: alerts.length > 0 ? 'failed' : 'passed'
  };

  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');

  await sendAlert(alerts);

  if (report.status === 'failed') {
    process.exitCode = 1;
  }

  console.log(JSON.stringify(report));
};

run();

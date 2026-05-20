import fs from 'node:fs/promises';
import path from 'node:path';
import { buildHtmlReport } from './html-template.js';

const repoRoot = process.cwd();
const reportsDir = path.join(repoRoot, 'reports');

const reportFiles = {
  phone: 'phone-report.json',
  formPopup: 'form-popup-report.json',
  domain: 'domain-health-report.json',
  twilio: 'twilio-report.json',
  playwright: 'playwright-report.json'
};

const readJson = async (filename) => {
  try {
    const raw = await fs.readFile(path.join(reportsDir, filename), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const normalizeStatus = (value) => {
  const status = String(value || 'unknown').toLowerCase();
  if (['passed', 'pass', 'ok', 'clean'].includes(status)) return 'passed';
  if (['skipped', 'skip'].includes(status)) return 'skipped';
  if (['warning', 'warn'].includes(status)) return 'warning';
  return 'failed';
};

const flattenEntries = ({ phone, formPopup, domain, twilio }) => {
  const entries = [];

  if (phone?.logs) {
    for (const log of phone.logs) {
      entries.push({
        targetName: log.targetName,
        testCategory: 'phone',
        status: normalizeStatus(log.resultStatus?.includes('skipped') ? 'skipped' : log.resultStatus),
        summary: log.resultStatus,
        details: log,
        skippedReason: log.resultStatus?.includes('skipped') ? log.errorMessage : null,
        recommendedNextAction: log.nextRecommendedAction
      });
    }
  } else if (phone) {
    entries.push({
      targetName: 'all',
      testCategory: 'phone',
      status: normalizeStatus(phone.status),
      summary: phone.summary || phone.status,
      details: phone,
      skippedReason: phone.skippedReason,
      recommendedNextAction: phone.logs?.[0]?.nextRecommendedAction
    });
  }

  if (Array.isArray(formPopup)) {
    for (const item of formPopup) {
      entries.push({
        targetName: item.targetName,
        testCategory: item.testCategory || 'website-form-popup',
        status: normalizeStatus(item.status),
        summary: item.summary,
        details: item.details,
        skippedReason: item.skippedReason,
        recommendedNextAction: item.recommendedNextAction
      });
    }
  }

  if (domain?.checks) {
    for (const check of domain.checks) {
      const status =
        check.statusCode === 'SKIPPED'
          ? 'skipped'
          : check.critical
          ? 'failed'
          : check.warning
          ? 'warning'
          : 'passed';

      entries.push({
        targetName: check.sourceTarget,
        testCategory: 'domain',
        status: normalizeStatus(status),
        summary: check.summary,
        details: check,
        skippedReason: check.skippedReason,
        recommendedNextAction: check.recommendedNextAction
      });
    }
  } else if (domain) {
    entries.push({
      targetName: 'all',
      testCategory: 'domain',
      status: normalizeStatus(domain.status),
      summary: domain.summary || domain.status,
      details: domain,
      skippedReason: domain.skippedReason || domain.skippedMxToolboxMessage,
      recommendedNextAction: null
    });
  }

  if (twilio) {
    entries.push({
      targetName: process.env.TWILIO_TO_NUMBER || 'twilio',
      testCategory: 'twilio-verification',
      status: normalizeStatus(twilio.status),
      summary: twilio.reason || twilio.status,
      details: twilio,
      skippedReason: twilio.status === 'skipped' ? twilio.reason : null,
      recommendedNextAction: null
    });
  }

  return entries;
};

const summarize = (entries) => {
  const counts = { passed: 0, failed: 0, skipped: 0, warning: 0 };
  for (const entry of entries) {
    counts[entry.status] = (counts[entry.status] || 0) + 1;
  }

  const overall = counts.failed > 0 ? 'failed' : counts.warning > 0 ? 'warning' : 'passed';

  return { counts, overall };
};

export const buildRunReport = async (environment = process.env.TEST_ENVIRONMENT || 'unknown') => {
  const phone = await readJson(reportFiles.phone);
  const formPopup = await readJson(reportFiles.formPopup);
  const domain = await readJson(reportFiles.domain);
  const twilio = await readJson(reportFiles.twilio);

  const generatedAt = new Date().toISOString();
  const entries = flattenEntries({ phone, formPopup, domain, twilio });
  const { counts, overall } = summarize(entries);

  const needsAttention = entries.filter((entry) =>
    ['failed', 'warning'].includes(entry.status)
  );

  return {
    generatedAt,
    environment,
    status: overall,
    summary: {
      totalChecks: entries.length,
      ...counts,
      needsAttentionCount: needsAttention.length
    },
    needsAttention,
    entries,
    sources: {
      phone: Boolean(phone),
      formPopup: Boolean(formPopup),
      domain: Boolean(domain),
      twilio: Boolean(twilio)
    }
  };
};

export const writeReports = async (report) => {
  await fs.mkdir(reportsDir, { recursive: true });

  const jsonPath = path.join(reportsDir, 'run-report.json');
  const htmlPath = path.join(reportsDir, 'run-report.html');

  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2), 'utf8');
  await fs.writeFile(htmlPath, buildHtmlReport(report), 'utf8');

  return { jsonPath, htmlPath };
};

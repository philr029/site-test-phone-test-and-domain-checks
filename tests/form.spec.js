import fs from 'node:fs/promises';
import path from 'node:path';
import { test, expect } from 'playwright/test';
import { getSelectedTargets } from '../src/config/target-loader.js';
import { FormPage } from '../src/pages/FormPage.js';
import { PopupHandler } from '../src/pages/PopupHandler.js';
import { FeatureChecker } from '../src/pages/FeatureChecker.js';
import { sendNotification } from '../src/utils/notifier.js';

const repoRoot = process.cwd();
const reportPath = path.join(repoRoot, 'reports', 'form-popup-report.json');
const networkArtifactDir = path.join(repoRoot, 'artifacts', 'network');

const { environment, defaults, targets } = await getSelectedTargets();

const isPlaceholderTarget = (url) => {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname === 'example.com' || hostname.endsWith('.example.com');
  } catch {
    return false;
  }
};

const writeAggregateReport = async (entry) => {
  await fs.mkdir(path.dirname(reportPath), { recursive: true });

  let payload = [];
  try {
    const raw = await fs.readFile(reportPath, 'utf8');
    payload = JSON.parse(raw);
    if (!Array.isArray(payload)) payload = [];
  } catch {
    payload = [];
  }

  payload.push(entry);
  await fs.writeFile(reportPath, JSON.stringify(payload, null, 2), 'utf8');
};

for (const target of targets) {
  const pageUrl = target.formUrl || target.url;
  const shouldSkipPlaceholder =
    isPlaceholderTarget(pageUrl) && process.env.ALLOW_PLACEHOLDER_TARGETS !== 'true';

  if (shouldSkipPlaceholder) {
    await writeAggregateReport({
      targetName: target.name,
      environment,
      status: 'skipped',
      timestamp: new Date().toISOString(),
      testCategory: 'website-form-popup',
      summary: 'Placeholder URL skipped',
      details: { url: pageUrl },
      skippedReason:
        'example.com is a demo placeholder. Replace website.url in config/targets.json or set ALLOW_PLACEHOLDER_TARGETS=true.',
      recommendedNextAction: 'Add your real website URL in config/targets.json.'
    });
  }

  const runTest = shouldSkipPlaceholder ? test.skip : test;

  runTest(
    `website checks for ${target.name}`,
    async ({ page }, testInfo) => {
    if (shouldSkipPlaceholder) return;

    const networkLogs = [];
    const consoleErrors = [];

    page.on('requestfailed', (request) => {
      networkLogs.push({
        type: 'requestfailed',
        url: request.url(),
        method: request.method(),
        failure: request.failure()?.errorText
      });
    });

    page.on('response', (response) => {
      if (response.status() >= 400) {
        networkLogs.push({
          type: 'response',
          url: response.url(),
          status: response.status()
        });
      }
    });

    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text());
      }
    });

    const popupHandler = new PopupHandler(page, target.popup, defaults.popupCloseSelectors || []);
    const formPage = new FormPage(page, target);
    const featureChecker = new FeatureChecker(page, target.popupChecks || []);

    let formResult = null;
    let assertion = null;
    let featureResults = [];
    let formMissing = false;

    try {
      await popupHandler.start();
      await formPage.open();
      featureResults = await featureChecker.runAll();

      const formLocator = page.locator(target.form?.selector || 'form').first();
      const formVisible = await formLocator.isVisible({ timeout: 8000 }).catch(() => false);

      if (!formVisible) {
        formMissing = true;
        throw new Error(`Form not visible using selector: ${target.form?.selector || 'form'}`);
      }

      formResult = await formPage.fillAndSubmit();
      assertion = await formPage.assertSubmission(formResult);

      if (formResult.submitted) {
        expect(assertion.passed).toBeTruthy();
      }
    } finally {
      await popupHandler.stop();

      const criticalFeatureFailures = featureResults.filter(
        (item) => item.critical && item.status === 'failed'
      );

      const status =
        testInfo.status === 'passed' && criticalFeatureFailures.length === 0 ? 'passed' : 'failed';

      const timestamp = new Date().toISOString();

      await writeAggregateReport({
        targetName: target.name,
        environment,
        status,
        timestamp,
        testCategory: 'website-form-popup',
        summary: formMissing
          ? 'Form missing or not visible'
          : formResult?.submitted
          ? assertion?.passed
            ? 'Form submitted and confirmation checks passed'
            : 'Form submitted but confirmation checks failed'
          : 'Form filled safely without submission',
        details: {
          url: assertion?.finalUrl || pageUrl,
          safeToSubmit: target.safeToSubmit === true,
          formResult,
          assertion,
          featureResults,
          popupsClosed: popupHandler.closedSelectors,
          consoleErrorCount: consoleErrors.length,
          failedNetworkCount: networkLogs.length
        },
        skippedReason: formResult?.submitted ? null : formResult?.reason,
        recommendedNextAction: formMissing
          ? 'Update formSelector/formUrl in config/targets.json.'
          : criticalFeatureFailures[0]?.recommendedNextAction ||
            (assertion?.passed === false
              ? 'Verify expectedSuccessText, successSelector, or successUrlContains.'
              : null)
      });

      if (status === 'failed') {
        await fs.mkdir(networkArtifactDir, { recursive: true });
        const artifactPath = path.join(networkArtifactDir, `${target.name}-${Date.now()}.json`);
        await fs.writeFile(
          artifactPath,
          JSON.stringify({ target: target.name, networkLogs, consoleErrors, featureResults }, null, 2),
          'utf8'
        );

        await sendNotification({
          title: 'Website Form/Feature Failure',
          environment,
          targetName: target.name,
          details:
            criticalFeatureFailures[0]?.details ||
            consoleErrors[0] ||
            networkLogs[0]?.failure ||
            'Website checks failed',
          timestamp
        }).catch(() => {});
      }
    }
  }
  );
}

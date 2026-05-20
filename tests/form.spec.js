import fs from 'node:fs/promises';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { getSelectedTargets } from '../src/config/target-loader.js';
import { FormPage } from '../src/pages/FormPage.js';
import { PopupHandler } from '../src/pages/PopupHandler.js';
import { sendNotification } from '../src/utils/notifier.js';

const repoRoot = process.cwd();
const reportPath = path.join(repoRoot, 'reports', 'form-popup-report.json');
const networkArtifactDir = path.join(repoRoot, 'artifacts', 'network');

const { environment, defaults, targets } = await getSelectedTargets();

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
  test(`form automation for ${target.name}`, async ({ page }, testInfo) => {
    test.skip(
      target.url?.includes('example.com') && process.env.ALLOW_PLACEHOLDER_TARGETS !== 'true',
      `Target ${target.name} uses placeholder URL. Set ALLOW_PLACEHOLDER_TARGETS=true to force execution.`
    );

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

    const popupHandler = new PopupHandler(
      page,
      target.popup,
      defaults.popupCloseSelectors || []
    );

    await popupHandler.start();

    const formPage = new FormPage(page, target);
    let assertion;

    try {
      await formPage.open();
      await formPage.fillAndSubmit();
      assertion = await formPage.assertSubmission();
      expect(assertion.passed).toBeTruthy();
    } finally {
      await popupHandler.stop();

      const status = testInfo.status === 'passed' ? 'passed' : 'failed';
      const timestamp = new Date().toISOString();

      await writeAggregateReport({
        targetName: target.name,
        environment,
        status,
        timestamp,
        url: assertion?.finalUrl,
        successSelectorPassed: assertion?.successSelectorPassed,
        successUrlPassed: assertion?.successUrlPassed,
        popupsClosed: popupHandler.closedSelectors,
        consoleErrorCount: consoleErrors.length,
        failedNetworkCount: networkLogs.length
      });

      if (status === 'failed') {
        await fs.mkdir(networkArtifactDir, { recursive: true });
        const artifactPath = path.join(networkArtifactDir, `${target.name}-${Date.now()}.json`);
        await fs.writeFile(
          artifactPath,
          JSON.stringify({ target: target.name, networkLogs, consoleErrors }, null, 2),
          'utf8'
        );

        await sendNotification({
          title: 'Form Submission Timeout / Failure',
          environment,
          targetName: target.name,
          details:
            consoleErrors[0] ||
            networkLogs[0]?.failure ||
            'Form assertion failed or timed out',
          timestamp
        }).catch(() => {});
      }
    }
  });
}

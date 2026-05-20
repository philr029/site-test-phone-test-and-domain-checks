import fs from 'node:fs/promises';
import path from 'node:path';
import { faker } from '@faker-js/faker';
import { chromium } from 'playwright';
import dotenv from 'dotenv';

dotenv.config();

const repoRoot = process.cwd();
const reportPath = path.join(repoRoot, 'reports', 'form-popup-report.json');
const screenshotDir = path.join(repoRoot, 'artifacts', 'screenshots');

const parseCsv = (value) =>
  (value || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

const loadConfig = async () => {
  const configPath = path.join(repoRoot, 'config', 'form-test.config.json');
  const file = JSON.parse(await fs.readFile(configPath, 'utf8'));

  return {
    targetUrl: process.env.TEST_TARGET_URL,
    formSelector: process.env.FORM_SELECTOR || file.formSelector,
    submitSelector: process.env.FORM_SUBMIT_SELECTOR || file.submitSelector,
    successSelector: process.env.FORM_SUCCESS_SELECTOR || file.successSelector,
    successUrlContains:
      process.env.FORM_SUCCESS_URL_CONTAINS || file.successUrlContains,
    popupCloseSelectors:
      parseCsv(process.env.POPUP_CLOSE_SELECTORS).length > 0
        ? parseCsv(process.env.POPUP_CLOSE_SELECTORS)
        : file.popupCloseSelectors
  };
};

const inferValue = (fieldName) => {
  const lower = fieldName.toLowerCase();
  if (lower.includes('email')) return faker.internet.email();
  if (lower.includes('phone')) return faker.phone.number('+1##########');
  if (lower.includes('name')) return faker.person.fullName();
  if (lower.includes('company')) return faker.company.name();
  if (lower.includes('message')) return faker.lorem.sentences(2);
  return faker.lorem.word();
};

const writeReport = async (result) => {
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify(result, null, 2), 'utf8');
};

const run = async () => {
  const config = await loadConfig();

  if (!config.targetUrl) {
    const skipped = {
      status: 'skipped',
      reason: 'TEST_TARGET_URL is not set',
      timestamp: new Date().toISOString()
    };
    await writeReport(skipped);
    console.log(JSON.stringify(skipped));
    return;
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const popupsClosed = [];

  try {
    await fs.mkdir(screenshotDir, { recursive: true });
    await page.goto(config.targetUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });

    for (const selector of config.popupCloseSelectors) {
      const popup = page.locator(selector).first();
      if (await popup.isVisible({ timeout: 1500 }).catch(() => false)) {
        await popup.click({ timeout: 2000 });
        popupsClosed.push(selector);
      }
    }

    const form = page.locator(config.formSelector).first();
    await form.waitFor({ state: 'visible', timeout: 15000 });

    const inputs = form.locator('input, textarea');
    const count = await inputs.count();

    for (let i = 0; i < count; i += 1) {
      const input = inputs.nth(i);
      const type = (await input.getAttribute('type')) || 'text';
      if (['hidden', 'submit', 'button', 'checkbox', 'radio', 'file'].includes(type)) {
        continue;
      }

      const name =
        (await input.getAttribute('name')) ||
        (await input.getAttribute('id')) ||
        `field_${i}`;

      await input.fill(inferValue(name));
    }

    const submit = form.locator(config.submitSelector).first();
    await submit.click();
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

    const successSelectorPassed =
      !config.successSelector ||
      (await page.locator(config.successSelector).first().isVisible({ timeout: 5000 }).catch(() => false));
    const successUrlPassed =
      !config.successUrlContains || page.url().includes(config.successUrlContains);

    const status = successSelectorPassed && successUrlPassed ? 'passed' : 'failed';
    const result = {
      status,
      url: page.url(),
      popupsClosed,
      successSelectorPassed,
      successUrlPassed,
      timestamp: new Date().toISOString()
    };

    await writeReport(result);
    console.log(JSON.stringify(result));

    if (status !== 'passed') {
      process.exitCode = 1;
    }
  } catch (error) {
    const screenshotPath = path.join(
      screenshotDir,
      `form-popup-failure-${Date.now()}.png`
    );
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});

    const failure = {
      status: 'failed',
      error: error.message,
      screenshotPath,
      popupsClosed,
      timestamp: new Date().toISOString()
    };
    await writeReport(failure);
    console.error(JSON.stringify(failure));
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
};

run();

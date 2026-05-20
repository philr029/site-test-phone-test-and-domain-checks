import { faker } from '@faker-js/faker';

const nonFillableTypes = new Set(['hidden', 'submit', 'button', 'checkbox', 'radio', 'file']);

const inferValue = (fieldName) => {
  const lower = String(fieldName || '').toLowerCase();
  if (lower.includes('email')) return faker.internet.email();
  if (lower.includes('phone')) return faker.phone.number('+1##########');
  if (lower.includes('name')) return faker.person.fullName();
  if (lower.includes('company')) return faker.company.name();
  if (lower.includes('message')) return faker.lorem.sentences(2);
  return faker.lorem.word();
};

export class FormPage {
  constructor(page, target) {
    this.page = page;
    this.target = target;
    this.formConfig = target.form || {};
    this.safeToSubmit = target.safeToSubmit === true;
  }

  async open() {
    const url = this.target.formUrl || this.target.url;
    await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  }

  async fillFields() {
    const form = this.page.locator(this.formConfig.selector || 'form').first();
    await form.waitFor({ state: 'visible', timeout: 15000 });

    const configuredFields = Array.isArray(this.formConfig.fields) ? this.formConfig.fields : [];

    if (configuredFields.length > 0) {
      for (const field of configuredFields) {
        const locator = form.locator(field.selector).first();
        const visible = await locator.isVisible({ timeout: 3000 }).catch(() => false);
        if (!visible) {
          throw new Error(`Configured field not visible: ${field.selector}`);
        }
        await locator.fill(field.value ?? inferValue(field.name || field.selector));
      }
      return { filled: configuredFields.length, mode: 'configured-fields' };
    }

    const fields = form.locator('input, textarea, select');
    const fieldCount = await fields.count();
    let filled = 0;

    for (let i = 0; i < fieldCount; i += 1) {
      const field = fields.nth(i);
      const tag = await field.evaluate((node) => node.tagName.toLowerCase());
      const type = (await field.getAttribute('type')) || 'text';
      if (tag === 'select') {
        const options = field.locator('option');
        if ((await options.count()) > 1) {
          await field.selectOption({ index: 1 }).catch(() => {});
          filled += 1;
        }
        continue;
      }

      if (nonFillableTypes.has(type)) continue;

      const identifier =
        (await field.getAttribute('name')) ||
        (await field.getAttribute('id')) ||
        `field_${i}`;

      await field.fill(inferValue(identifier));
      filled += 1;
    }

    return { filled, mode: 'auto-detected-fields' };
  }

  async submitForm() {
    if (!this.safeToSubmit) {
      return {
        submitted: false,
        reason: 'safeToSubmit is false — form was filled but not submitted'
      };
    }

    const form = this.page.locator(this.formConfig.selector || 'form').first();
    const submitSelector = this.formConfig.submitSelector || "button[type='submit']";
    await form.locator(submitSelector).first().click();
    await this.page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

    return { submitted: true, reason: null };
  }

  async fillAndSubmit() {
    const fillResult = await this.fillFields();
    const submitResult = await this.submitForm();
    return { ...fillResult, ...submitResult };
  }

  async assertSubmission(submitResult) {
    if (!submitResult.submitted) {
      return {
        passed: true,
        skippedSubmission: true,
        reason: submitResult.reason,
        successSelectorPassed: null,
        successUrlPassed: null,
        successTextPassed: null,
        finalUrl: this.page.url()
      };
    }

    const selector = this.formConfig.successSelector;
    const expectedUrlToken = this.formConfig.successUrlContains;
    const expectedText = this.formConfig.expectedSuccessText;

    const successSelectorPassed =
      !selector ||
      (await this.page
        .locator(selector)
        .first()
        .isVisible({ timeout: 5000 })
        .catch(() => false));

    const successUrlPassed = !expectedUrlToken || this.page.url().includes(expectedUrlToken);

    let successTextPassed = true;
    if (expectedText) {
      const bodyText = (await this.page.locator('body').innerText({ timeout: 5000 }).catch(() => ''))
        .toLowerCase();
      successTextPassed = bodyText.includes(expectedText.toLowerCase());
    }

    return {
      successSelectorPassed,
      successUrlPassed,
      successTextPassed,
      skippedSubmission: false,
      finalUrl: this.page.url(),
      passed: successSelectorPassed && successUrlPassed && successTextPassed
    };
  }
}

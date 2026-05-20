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
  }

  async open() {
    await this.page.goto(this.target.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  }

  async fillAndSubmit() {
    const form = this.page.locator(this.formConfig.selector || 'form').first();
    await form.waitFor({ state: 'visible', timeout: 15000 });

    const fields = form.locator('input, textarea');
    const fieldCount = await fields.count();

    for (let i = 0; i < fieldCount; i += 1) {
      const field = fields.nth(i);
      const type = (await field.getAttribute('type')) || 'text';
      if (nonFillableTypes.has(type)) continue;

      const identifier =
        (await field.getAttribute('name')) ||
        (await field.getAttribute('id')) ||
        `field_${i}`;

      await field.fill(inferValue(identifier));
    }

    const submitSelector = this.formConfig.submitSelector || "button[type='submit']";
    await form.locator(submitSelector).first().click();
    await this.page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  }

  async assertSubmission() {
    const selector = this.formConfig.successSelector;
    const expectedUrlToken = this.formConfig.successUrlContains;

    const successSelectorPassed =
      !selector ||
      (await this.page
        .locator(selector)
        .first()
        .isVisible({ timeout: 5000 })
        .catch(() => false));

    const successUrlPassed = !expectedUrlToken || this.page.url().includes(expectedUrlToken);

    return {
      successSelectorPassed,
      successUrlPassed,
      finalUrl: this.page.url(),
      passed: successSelectorPassed && successUrlPassed
    };
  }
}

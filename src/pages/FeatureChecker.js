export class FeatureChecker {
  constructor(page, checks = []) {
    this.page = page;
    this.checks = checks;
  }

  async runAll() {
    const results = [];

    for (const check of this.checks) {
      const result = {
        name: check.name || 'Feature',
        selector: check.selector,
        expectedText: check.expectedText || '',
        critical: Boolean(check.critical),
        status: 'skipped',
        details: '',
        recommendedNextAction: null
      };

      if (!check.selector) {
        result.status = 'skipped';
        result.details = 'No selector configured';
        results.push(result);
        continue;
      }

      try {
        const locator = this.page.locator(check.selector).first();
        const visible = await locator.isVisible({ timeout: 5000 }).catch(() => false);

        if (!visible) {
          result.status = check.critical ? 'failed' : 'warning';
          result.details = `Element not visible: ${check.selector}`;
          result.recommendedNextAction = check.critical
            ? 'Fix selector or ensure the feature loads on this page.'
            : 'Optional feature missing — verify if still required.';
          results.push(result);
          continue;
        }

        if (check.expectedText) {
          const text = (await locator.innerText({ timeout: 3000 }).catch(() => '')).trim();
          if (!text.toLowerCase().includes(check.expectedText.toLowerCase())) {
            result.status = check.critical ? 'failed' : 'warning';
            result.details = `Visible but expected text "${check.expectedText}" not found`;
            result.recommendedNextAction = 'Update expectedText or fix on-page copy.';
            results.push(result);
            continue;
          }
        }

        result.status = 'passed';
        result.details = 'Feature visible';
        results.push(result);
      } catch (error) {
        result.status = check.critical ? 'failed' : 'warning';
        result.details = error.message;
        result.recommendedNextAction = 'Check selector and page load timing.';
        results.push(result);
      }
    }

    return results;
  }
}

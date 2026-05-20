const defaultPopupSelectors = [
  "button[aria-label*='close' i]",
  "button:has-text('Close')",
  "button:has-text('No thanks')",
  "button:has-text('Accept')",
  "button:has-text('Reject')",
  "button:has-text('Dismiss')"
];

export class PopupHandler {
  constructor(page, popupConfig, defaultSelectors = []) {
    this.page = page;
    this.popupConfig = popupConfig || {};
    this.defaultSelectors = defaultSelectors;
    this.closedSelectors = [];
    this.interval = null;
    this.dialogListener = null;
  }

  get selectors() {
    return [
      ...(this.popupConfig.closeSelectors || []),
      ...this.defaultSelectors,
      ...defaultPopupSelectors
    ].filter(Boolean);
  }

  async closeVisiblePopups() {
    if (this.popupConfig.enabled === false) return;

    for (const selector of this.selectors) {
      const popup = this.page.locator(selector).first();
      const visible = await popup.isVisible({ timeout: 500 }).catch(() => false);
      if (!visible) continue;

      await popup.click({ timeout: 1500 }).catch(() => {});
      this.closedSelectors.push(selector);
    }
  }

  async start() {
    this.dialogListener = async (dialog) => {
      await dialog.dismiss().catch(() => {});
      this.closedSelectors.push(`dialog:${dialog.type()}`);
    };

    this.page.on('dialog', this.dialogListener);
    await this.closeVisiblePopups();

    this.interval = setInterval(() => {
      this.closeVisiblePopups().catch(() => {});
    }, 1000);
  }

  async stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    if (this.dialogListener) {
      this.page.off('dialog', this.dialogListener);
      this.dialogListener = null;
    }

    await this.closeVisiblePopups();
  }
}

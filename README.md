# site-test-phone-test-and-domain-checks

End-to-end QA automation architecture for:
- Playwright-based web form + pop-up validation
- Twilio SMS/phone verification testing
- MXToolbox-backed domain/IP health monitoring

## Repository structure

```text
.
├── .env.example
├── .github/
│   └── workflows/
│       └── main.yml
├── artifacts/
│   └── screenshots/
├── config/
│   ├── domain-targets.json
│   └── form-test.config.json
├── reports/
├── src/
│   ├── domain-health-check.js
│   ├── form-popup-test.js
│   ├── run-all.js
│   └── twilio-verification-test.js
├── package.json
└── playwright.config.js
```

## Setup

1. Clone and enter the repo.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy `.env.example` to `.env` and configure values.
4. (Local Playwright runtime) install Chromium:
   ```bash
   npx playwright install chromium
   ```

## Script modules

### 1) Form + pop-up testing
Runs Playwright against `TEST_TARGET_URL`, closes configured pop-ups, fills detected form fields with Faker mock data, submits, and validates success via selector and/or URL.

```bash
npm run test:form-popup
```

Outputs: `reports/form-popup-report.json` and failure screenshots under `artifacts/screenshots/`.

### 2) Automated phone/SMS testing (Twilio)
Supports two modes:
- `TWILIO_TEST_MODE=webhook`: sends outbound SMS and validates Twilio accepted/sent state.
- `TWILIO_TEST_MODE=otp`: polls Twilio inbox for OTP, parses with regex, and can auto-fill OTP using Playwright selectors.

```bash
npm run test:twilio
```

Outputs: `reports/twilio-report.json`.

### 3) MXToolbox domain health checks
Checks domains/IPs from env (`DOMAIN_TARGETS`, `IP_TARGETS`) or `config/domain-targets.json`.
- If `MXTOOLBOX_API_KEY` exists, calls `/api/v1/lookup/blacklist/{argument}`.
- If not, uses DNS fallback checks (MX/NS/PTR + SMTP reachability probe for domains).
- Emits alerts to stdout and optional `ALERT_WEBHOOK_URL`.

```bash
npm run test:domain
```

Outputs: `reports/domain-health-report.json`.

## Run all modules

```bash
npm run test:e2e
```

## GitHub Actions

Workflow file: `.github/workflows/main.yml`
- Runs every 24 hours using cron (`0 0 * * *`)
- Supports manual execution via `workflow_dispatch`
- Uses secrets for sensitive values (`MXTOOLBOX_API_KEY`, `TWILIO_AUTH_TOKEN`, `TEST_TARGET_URL`, etc.)
- Uploads reports and failure screenshots as workflow artifacts

## Suggested GitHub Secrets

- `TEST_TARGET_URL`
- `FORM_SELECTOR`
- `FORM_SUCCESS_SELECTOR`
- `FORM_SUCCESS_URL_CONTAINS`
- `FORM_SUBMIT_SELECTOR`
- `POPUP_CLOSE_SELECTORS`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER`
- `TWILIO_TO_NUMBER`
- `TWILIO_TEST_MODE`
- `TWILIO_OTP_REGEX`
- `TWILIO_EXPECTED_FROM`
- `OTP_PAGE_URL`
- `OTP_FIELD_SELECTOR`
- `OTP_SUBMIT_SELECTOR`
- `MXTOOLBOX_API_KEY`
- `DOMAIN_TARGETS`
- `IP_TARGETS`
- `ALERT_WEBHOOK_URL`

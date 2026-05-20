# site-test-phone-test-and-domain-checks

Enterprise-ready QA automation for:
- Playwright web form + popup validation (POM architecture)
- Twilio SMS verification with exponential backoff polling
- MXToolbox domain/IP monitoring with delta-only alerting

## Refactored directory tree

```text
.
├── .env.example
├── .github/
│   └── workflows/
│       └── main.yml
├── artifacts/
│   ├── network/
│   └── screenshots/
├── config/
│   └── targets.json
├── data/
│   └── health_cache.json
├── reports/
├── src/
│   ├── config/
│   │   └── target-loader.js
│   ├── pages/
│   │   ├── FormPage.js
│   │   └── PopupHandler.js
│   ├── utils/
│   │   └── notifier.js
│   ├── domain-health-check.js
│   ├── run-all.js
│   └── twilio-verification-test.js
├── tests/
│   └── form.spec.js
├── package.json
└── playwright.config.js
```

## Multi-target configuration (`config/targets.json`)

Each target defines website behavior and MXToolbox domain/IP checks:
- `name`, `url`
- `form.selector`, `form.submitSelector`, `form.successSelector`, `form.successUrlContains`
- `popup.enabled`, `popup.closeSelectors`
- `mxtoolbox.domains[]`, `mxtoolbox.ips[]`

Use `TARGET_NAME=<name>` to isolate a single target for execution.

## Playwright failure artifacts and debug controls

`playwright.config.js` now retains only failure artifacts:
- `screenshot: only-on-failure`
- `video: retain-on-failure`
- `trace: retain-on-failure`
- HTML and JSON reporters

`tests/form.spec.js` also captures and stores:
- failed network requests / >=400 responses
- console errors
- popup dismiss events

## Twilio robust polling

`src/twilio-verification-test.js` includes:
- max timeout-based polling (`TWILIO_OTP_TIMEOUT_MS`, default 60000)
- exponential backoff between Twilio API polls
- regex token extraction with capture-group support
- graceful abort/cleanup of polling wait handlers

## MXToolbox delta reporting

`src/domain-health-check.js` now uses cache state in `data/health_cache.json`:
- full checks are always logged into `reports/domain-health-report.json`
- notifications are only sent for state changes (delta-based)
- critical change logic prevents repeated alert spam when status is unchanged

## Notification utility

`src/utils/notifier.js` supports Slack/Discord/Teams webhook payloads and includes:
- Environment/Target name
- Failure details
- Execution timestamp
- GitHub Actions run URL (when available)

## Local execution guide

Install dependencies:

```bash
npm install
npx playwright install chromium
```

Run all modules:

```bash
npm run test:e2e
```

Run only a specific form target:

```bash
TARGET_NAME=example-site npm run test:form-popup
```

Run only domain checks for one target:

```bash
TARGET_NAME=example-site npm run test:domain
```

Run only Twilio checks:

```bash
npm run test:twilio
```

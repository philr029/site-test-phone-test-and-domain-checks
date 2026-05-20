# site-test-phone-test-and-domain-checks

Daily automation toolkit for marketing and IT checks:

- Phone line tests (Twilio outbound, honest status reporting)
- Website form tests (Playwright, safe submit guard)
- Popup/banner/live chat feature checks
- Domain/IP/email health checks (MXToolbox API + DNS fallback)
- JSON + HTML reports for local review or sharing

Public docs: https://philr029.github.io/site-test-phone-test-and-domain-checks/

## Directory structure

```text
.
├── config/targets.json          # Beginner-friendly target config
├── docs/
│   ├── index.html               # GitHub Pages landing page
│   ├── styles.css               # Dashboard styles (light/dark)
│   └── script.js                # Theme toggle & interactions
├── reports/                     # Generated reports (gitignored)
├── src/
│   ├── phone-test.js            # Outbound phone line checks
│   ├── domain-health-check.js   # MXToolbox + DNS fallback
│   ├── generate-report.js       # Build combined report
│   ├── run-all.js               # Run all core checks + report
│   ├── reporting/               # Report builder + HTML template
│   └── pages/                   # Playwright page objects
└── tests/form.spec.js           # Form + popup/feature checks
```

## Config (`config/targets.json`)

Each target supports:

- `website.url`, `website.formUrl`, `website.safeToSubmit`
- `website.formSelector`, `website.expectedSuccessText`
- `website.popupChecks[]` with `name`, `selector`, `expectedText`, `critical`
- `phone.enabled`, `phone.number`, `phone.expectedBehaviour`
- `domain.enabled`, `domain.domain`, `domain.ip`

Set `enabled: false` on a target to skip it.

## NPM scripts

```bash
npm run test:e2e          # form/popup + phone + domain + combined report
npm run test:form-popup   # Playwright website checks
npm run test:phone        # Twilio outbound phone checks
npm run test:domain       # Domain/IP/email health checks
npm run test:twilio       # Optional SMS/OTP verification flow
npm run report            # Build reports from existing JSON outputs
npm run clean:reports     # Remove generated report files
```

## Environment variables

Copy `.env.example` to `.env` and fill in only what you need.

| Variable | Required for | If missing |
|---|---|---|
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` | Phone tests | Phone checks are **skipped** |
| `MXTOOLBOX_API_KEY` | API reputation lookups | DNS fallback checks run instead |
| `NOTIFIER_WEBHOOK_URL` | Alerts | Notifications are skipped |

## Safety rules

- Real API keys must stay in `.env` (gitignored), never committed.
- Missing API keys return **skipped**, not fake passes.
- Forms are not submitted unless `safeToSubmit: true`.
- Phone answer detection uses Twilio status polling only (no fake "answered").

## Local quick start

```bash
npm install
npx playwright install chromium
cp .env.example .env
npm run test:e2e
open reports/run-report.html
```

For placeholder `example.com` targets, either replace URLs in config or run with:

```bash
ALLOW_PLACEHOLDER_TARGETS=true npm run test:form-popup
```

## GitHub Pages

1. Push this repository to GitHub.
2. In repository settings → Pages, set source to **Deploy from branch**.
3. Branch: `main`, folder: `/docs`.
4. Your site will publish `docs/index.html`.

## GitHub Actions

Workflow: `.github/workflows/main.yml`

Add repository secrets:

- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`
- `MXTOOLBOX_API_KEY` (optional)
- `NOTIFIER_WEBHOOK_URL` (optional)

## What is not fully automated yet

- Deep phone IVR/answer analytics (add Twilio status callback URL).
- DKIM validation without a known selector (`domain.dkimSelector` planned).
- Real form submission on production sites unless you explicitly set `safeToSubmit: true`.

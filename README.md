# site-test-phone-test-and-domain-checks

Daily automation toolkit for marketing and IT checks:

- Phone line tests (Twilio outbound, honest status reporting)
- Website form tests (Playwright, safe submit guard)
- Popup/banner/live chat feature checks
- Domain/IP/email health checks (MXToolbox API + DNS fallback)
- JSON + HTML reports for local review or sharing

Public docs: https://philr029.github.io/site-test-phone-test-and-domain-checks/

## Interactive QA dashboard

The `docs/` folder is now a tabbed testing dashboard (Dashboard, Site Tests, Phone Tests, Domain & IP, Spreadsheet Upload, Reports, Settings).

**Local development (live checks via API; keys stay in `.env`):**

**One command (easiest):**

```bash
npm run dev
```

Then open http://127.0.0.1:8080/ in your browser (Chrome or Safari). Keep the terminal open.

**Or two terminals:**

```bash
npm run dev:api
```

```bash
npm run dev:dashboard
```

If port 3847 is already in use:

```bash
lsof -i :3847
kill <PID>
```

Or use another port: `DASHBOARD_API_PORT=3848 npm run dev:api` (then set the same URL in Dashboard Settings).

On GitHub Pages, the UI runs in **mock / browser DNS mode** when the local API is not reachable. Full Playwright and Twilio automation still use the CLI scripts below.

```bash
npm run build            # Verify dashboard assets
```

## Spreadsheet ingestion API (Phase 1)

Secure batch upload pipeline for the Spreadsheet UI. See [`ingestion/README.md`](ingestion/README.md) for full docs.

```bash
npm run dev:ingest       # Ingestion API on :3850
npm run test:ingestion   # Frontend parser/mapper unit tests
npm run test:ingestion:api
```

Set `localStorage.setItem('ingest-api-base', 'http://127.0.0.1:3850')` when using the dashboard against a local ingestion server.

## Directory structure

```text
.
├── config/targets.json          # Beginner-friendly target config
├── docs/
│   ├── index.html               # QA testing dashboard (GitHub Pages)
│   ├── styles.css               # Dashboard styles (light/dark)
│   ├── js/                      # Modular dashboard app
│   │   └── ingestion/           # FileUpload, ParserWorker, ColumnMapper
│   └── samples/                 # Sample CSV for upload tests
├── ingestion/                   # Express ingestion API + React TS components
├── src/api/                     # Local API (secrets in .env only)
├── src/lib/                     # Shared check logic for API
├── samples/                     # Sample spreadsheet data
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

## Spreadsheet module

The dashboard **Spreadsheet** tab provides a modular engine for bulk upload, validation, and batch checks against domain, phone, and site test modules.

### Architecture

```text
docs/js/spreadsheet/
├── constants.js        # Column aliases, validation types, limits
├── file-handler.js     # Upload, size limits, worker orchestration
├── parser.js           # CSV (PapaParse) + XLSX (SheetJS) parsing
├── validation.js       # Column/row validation + cleaning
├── batch-processor.js  # Multi-check batch execution + progress
├── table-ui.js         # Sortable, filterable, paginated table
├── worker.js           # Web worker for heavy parse/validate
└── index.js            # Public API
```

### Example spreadsheet formats

**Domain-only** (`samples/domains-sample.csv`):

```csv
company,domain,ip,website,notes
Acme Corp,example.com,93.184.216.34,https://example.com,Sample row
```

**Multi-check** (`samples/multi-check-sample.csv`):

```csv
company,domain,ip,website,phone,email,notes
Acme Corp,example.com,93.184.216.34,https://example.com,+441234567890,ops@acme.com,Full row
Test UK Ltd,google.com,,https://www.google.com,,,Site + domain
```

Supported columns are auto-detected from headers (case-insensitive): `domain`, `ip`, `website`/`url`, `phone`, `email`, `company`.

### Validation rules

| Type | Rule |
|------|------|
| `email` | Standard `user@domain.tld` format |
| `domain` | Valid FQDN; strips `https://` prefix |
| `ip` | IPv4 (octets ≤ 255) or IPv6 |
| `phone` | 7–15 digits; optional `+` prefix |
| `url` | Must include `http://` or `https://` (auto-prefixed in cleaned view) |
| `numeric` | Parseable number |
| `boolean` | `true/false`, `yes/no`, `1/0` |

Invalid cells are highlighted in the table. Override column validation types under **Column validation rules** (defaults to auto-detected types). Download a **Validation Report** as JSON or CSV from the upload controls.

### Batch processing

1. Upload a `.csv` or `.xlsx` file (up to **50,000 rows**).
2. Toggle **Raw View** / **Cleaned View** to inspect normalized values.
3. Optionally override **Column validation rules** per column (email, domain, IP, phone, URL, numeric, boolean, text).
4. Select check types: Domain & IP, Phone, Site.
5. Map spreadsheet columns to each check type.
6. Click **Run batch checks** — progress bar shows row-by-row status.
7. Export results as CSV or JSON, or export the cleaned dataset.

Batch checks call the same clients as the individual test tabs (`runDomainCheck`, `runPhoneTest`, `runSiteCheck`), using the local API when `npm run dev` is running.

**Example column mapping for multi-check sample:**

| Check type | Map to column |
|------------|---------------|
| Domain & IP | `domain` (falls back to `ip` if domain empty) |
| Phone | `phone` |
| Site | `website` |

### Error handling examples

| Error | Cause | Resolution |
|-------|-------|------------|
| `Unsupported file type` | Not `.csv` / `.xlsx` | Re-export from Excel as CSV or XLSX |
| `File has no header row` | Empty file | Add a header row with column names |
| `File exceeds 50,000 rows` | Too many rows | Split into smaller files |
| `XLSX library not loaded` | SheetJS CDN blocked | Check network; reload page |
| Row flagged `Invalid email format` | Bad email in column | Fix source data or use Cleaned View export |
| Batch row `warn` with validation issues | Row failed pre-checks | Fix row in source file; invalid rows skip API calls |

### Unit tests

```bash
npm run test:unit    # Parser, validation, batch processor
npm test             # Unit tests + Playwright form tests
```

### Performance

- CSV files with 500+ rows offload **parse + validate** to a **Web Worker**.
- XLSX files parse on the main thread (SheetJS); validation runs in a worker for 500+ rows.
- The data table uses **pagination** (25–500 rows per page) and **virtual scroll** (lazy row rendering) for 200+ visible rows.
- Batch processing yields to the main thread between rows for progress updates.

# Spreadsheet Ingestion Integration

Production-ready pipeline connecting the dashboard Spreadsheet UI to a secure batch ingestion API.

## File tree

```text
ingestion/
├── README.md                          # This file
├── backend/                           # Express + TypeScript ingestion API
│   ├── package.json
│   ├── tsconfig.json
│   ├── data/                          # SQLite persistence (gitignored)
│   ├── src/
│   │   ├── index.ts                   # Express app entry
│   │   ├── types.ts
│   │   ├── middleware/
│   │   │   ├── auth.ts                # Upload token validation
│   │   │   └── rateLimit.ts
│   │   ├── routes/
│   │   │   ├── auth.ts                # POST /auth/upload-token
│   │   │   └── ingest.ts              # POST /ingest, GET /ingest/status/:batchId
│   │   └── services/
│   │       ├── tokenService.ts
│   │       ├── ingestService.ts
│   │       └── store.ts               # SQLite persistence
│   └── tests/
│       ├── ingest.test.ts
│       ├── ingestService.test.ts
│       └── helpers/request.ts
├── frontend-react/                    # React + TypeScript alternative
│   ├── package.json
│   └── src/
│       ├── components/
│       │   ├── FileUpload.tsx
│       │   └── ColumnMapper.tsx
│       ├── hooks/useParserWorker.ts
│       └── types.ts
docs/js/ingestion/                     # Plain JS (GitHub Pages compatible)
├── constants.js
├── FileUpload.js
├── ParserWorker.js
├── parser-worker.js                   # Classic Web Worker (PapaParse + SheetJS)
├── ColumnMapper.js
└── index.js
docs/js/services/ingestion-client.js   # API client (token + batch upload)
tests/ingestion/
└── parser-column-mapper.test.js
```

## Example CSV / XLSX formats

**Domain check sample** (`samples/domains-sample.csv`):

```csv
company,domain,ip
Acme Ltd,example.com,93.184.216.34
Beta Corp,google.com,142.250.185.78
```

**Multi-check sample** (`samples/multi-check-sample.csv`):

```csv
company,email,domain,phone,website
Acme,a@acme.com,acme.com,+447700900000,https://acme.com
```

XLSX files use the first sheet; row 1 must be headers.

## Column mapping examples

| Spreadsheet column | API field | Preset        |
|--------------------|-----------|---------------|
| `Email Address`    | `email`   | multi-check   |
| `Domain`           | `domain`  | domain-check  |
| `Phone Number`     | `phone`   | phone-check   |
| `Website URL`      | `url`     | multi-check   |
| `Company Name`     | `company` | all presets   |

Client request shape:

```json
{
  "batchId": "550e8400-e29b-41d4-a716-446655440000",
  "mapping": { "colA": "email", "colB": "domain", "colC": "phone" },
  "rows": [
    { "colA": "a@x.com", "colB": "x.com", "colC": "+447700900000" }
  ],
  "idempotencyKey": "user-123-upload-20260619-1"
}
```

Server response:

```json
{
  "batchId": "550e8400-e29b-41d4-a716-446655440000",
  "processed": 100,
  "succeeded": 92,
  "failed": 8,
  "errors": [{ "rowIndex": 3, "error": "invalid phone format" }]
}
```

## Run locally

### Backend (port 3850)

```bash
cd ingestion/backend
npm install
npm run dev
```

### Dashboard + existing QA API

```bash
npm run dev                    # UI :8080 + QA API :3847
```

Set ingestion API URL in browser console or Settings:

```js
localStorage.setItem('ingest-api-base', 'http://127.0.0.1:3850');
```

### Tests

```bash
# Frontend unit tests (plain JS)
npm run test:ingestion

# Backend tests
cd ingestion/backend && npm test
```

## API curl examples

**Get upload token** (required before every upload session):

```bash
curl -s -X POST http://127.0.0.1:3850/auth/upload-token \
  -H 'Content-Type: application/json' \
  -d '{"uploadSessionId":"demo-session-1"}'
```

**Ingest a batch** (use token from above):

```bash
TOKEN="<token-from-auth>"
curl -s -X POST http://127.0.0.1:3850/ingest \
  -H "Content-Type: application/json" \
  -H "x-upload-token: $TOKEN" \
  -d '{
    "batchId":"batch-001",
    "mapping":{"email_col":"email","domain_col":"domain"},
    "rows":[
      {"email_col":"a@x.com","domain_col":"x.com"},
      {"email_col":"bad","domain_col":"x.com"}
    ],
    "idempotencyKey":"user-123-upload-20260619-1"
  }'
```

**Check batch status:**

```bash
curl -s http://127.0.0.1:3850/ingest/status/batch-001 \
  -H "x-upload-token: $TOKEN"
```

## Large files and failure simulation

- CSV parsing uses PapaParse **streaming** in the Web Worker for files over 500 rows.
- Preview shows the first **50 rows**; full data is sent in configurable batches (next phase: `BatchUploader`).
- Simulate transient upstream failures: `SIMULATE_TRANSIENT=1 npm run dev` in `ingestion/backend`.
- Simulate domain check failures: add a row with `domain` = `fail.example` and `SIMULATE_FAILURE=1`.

## Security and performance notes

- **Never** embed long-lived API keys in the browser. Request a short-lived token from `POST /auth/upload-token` (default TTL: 15 minutes).
- Send the token in the `x-upload-token` header on ingest requests.
- Ingest endpoint is rate-limited (60 req/min default).
- **Idempotency**: each row gets `idempotencyKey-row-{index}`; retries return cached results.
- Parsing and validation run in a **Web Worker** to keep the UI responsive.
- SQLite stores batch state for resume and status polling.

## Plain JS usage (dashboard)

```javascript
import { createFileUpload, renderPreviewTable, createColumnMapper } from './js/ingestion/index.js';
import { requestUploadToken, ingestBatch } from './js/services/ingestion-client.js';

const uploadRoot = document.getElementById('ingest-upload');
createFileUpload(uploadRoot, {
  onParsed: (data) => {
    document.getElementById('preview').innerHTML =
      renderPreviewTable(data.headers, data.previewRows);
    createColumnMapper(document.getElementById('mapper'), {
      headers: data.headers,
      onChange: (mapping) => { window.__mapping = mapping; }
    });
  },
  onError: (err) => console.error(err)
});
```

## React + TypeScript alternative

```tsx
import { FileUpload, ColumnMapper } from '../ingestion/frontend-react/src';

<FileUpload onParsed={setParsed} onError={setError} />
{parsed && (
  <ColumnMapper headers={parsed.headers} onChange={setMapping} />
)}
```

## Migration plan (GitHub Pages / existing repo)

1. **Phase 1 (this PR)** — `FileUpload`, `ParserWorker`, `ColumnMapper`, auth + ingest API, tests, README.
2. **Phase 2** — Add `DataCleaner`, `Validator`, `BatchUploader`, `ResultsTable` under `docs/js/ingestion/`.
3. **Phase 3** — Wire `docs/js/pages/spreadsheet.js` to optional "Server ingest" mode using `ingestion-client.js`.
4. **Phase 4** — Deploy ingestion API (Railway/Fly/Vercel serverless) with Redis token store + Bull queue.
5. **Phase 5** — Add `ingest-api-base` to Dashboard Settings UI (`docs/js/pages/settings.js`).

**GitHub Pages constraints:** static UI only; ingestion API must run on a separate host. Set `localStorage['ingest-api-base']` or deploy API and document CORS (`CORS_ORIGIN`).

**CI:** add `npm run test:ingestion` and `cd ingestion/backend && npm test` to `.github/workflows/main.yml`.

# AGENTS.md

## Cursor Cloud specific instructions

This repo is a Node.js (ESM, `"type": "module"`) QA automation toolkit. Node 22 / npm 10 are available. Standard commands live in `README.md` and `package.json` scripts; the notes below only cover non-obvious caveats for running/testing in the cloud VM.

### Services
- **Dashboard** (`npm run dev`): starts both the local API (`src/api/server.js`, port `3847`) and the static UI server (`src/api/static-server.js`, serving `docs/` on port `8080`). Open `http://127.0.0.1:8080/`. This is a long-running process — start it in a background/tmux session, not a blocking foreground call. `npm run dev:api` / `npm run dev:dashboard` run the two halves separately.
- The API keeps all secrets in `.env` (gitignored) and never exposes them to the browser. Copy `.env.example` to `.env`; the app runs fine with empty keys.

### Testing / build (no lint script exists)
- `npm run test:unit` — Node built-in test runner over `tests/spreadsheet/*.test.js` (fast, no browser/network).
- `npm run test:form-popup` — Playwright form checks. Requires the Chromium browser (installed by the update script via `npx playwright install --with-deps chromium`).
- `npm run build` — validates dashboard assets and syncs sample CSVs into `docs/samples/`.

### Non-obvious caveats
- The default `config/targets.json` target uses the placeholder `example.com`. Placeholder domains/URLs are **intentionally skipped** by `test:form-popup` and `test:domain` unless you set `ALLOW_PLACEHOLDER_TARGETS=true`. When forced to run against `example.com`, the form test *fails* with "Form not visible" because that page has no `<form>` — this is expected, not an environment problem. Point `config/targets.json` at a real site to get a meaningful pass.
- Missing API keys (Twilio, MXToolbox, etc.) cause checks to report `skipped` / use DNS fallback rather than fail. Domain/IP checks work with no keys via live DNS lookups (needs outbound network).
- `test:phone` / `test:twilio` require Twilio credentials; without them phone checks are skipped.

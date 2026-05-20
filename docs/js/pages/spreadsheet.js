import {
  parseCsv,
  parseXlsx,
  detectColumns,
  rowsToObjects
} from '../services/spreadsheet.js';
import { runDomainCheck } from '../services/domain-client.js';
import { saveHistoryEntry } from '../storage.js';
import { loadingHtml, emptyStateHtml } from '../components/loading.js';
import { badgeHtml } from '../components/badges.js';
import { exportCsv } from '../components/export-buttons.js';

let parsedData = null;
let checkResults = [];

export const renderSpreadsheet = () => `
  <section class="page-header">
    <div>
      <p class="page-eyebrow">Bulk checks</p>
      <h1>Spreadsheet Upload</h1>
      <p class="page-desc">Upload daily CSV or XLSX with domain, IP, URL, or company columns.</p>
    </div>
  </section>
  <div class="upload-zone" id="upload-zone">
    <input type="file" id="sheet-file" accept=".csv,.xlsx,.xls" hidden />
    <p>Drop .csv or .xlsx here, or <button type="button" class="link-btn" id="pick-file">browse</button></p>
    <p class="hint"><a href="samples/domains-sample.csv" download>Download sample CSV</a></p>
  </div>
  <div id="sheet-preview"></div>
  <div id="sheet-results"></div>
`;

export const bindSpreadsheet = (root) => {
  const zone = root.querySelector('#upload-zone');
  const input = root.querySelector('#sheet-file');
  const preview = root.querySelector('#sheet-preview');
  const resultsEl = root.querySelector('#sheet-results');

  root.querySelector('#pick-file')?.addEventListener('click', () => input.click());

  const handleFile = async (file) => {
    if (!file) return;
    try {
      let parsed;
      if (file.name.endsWith('.csv')) {
        parsed = parseCsv(await file.text());
      } else if (file.name.match(/\.xlsx?$/i)) {
        parsed = await parseXlsx(await file.arrayBuffer());
      } else {
        throw new Error('Unsupported file type. Use .csv or .xlsx');
      }
      const mapping = detectColumns(parsed.headers);
      parsedData = {
        fileName: file.name,
        mapping,
        rows: rowsToObjects(parsed.headers, parsed.rows, mapping)
      };
      renderPreview(preview, parsedData);
      resultsEl.innerHTML = '';
    } catch (err) {
      preview.innerHTML = `<div class="alert alert-error">${err.message}</div>`;
    }
  };

  input?.addEventListener('change', () => handleFile(input.files[0]));
  zone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('dragover');
  });
  zone?.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone?.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('dragover');
    handleFile(e.dataTransfer.files[0]);
  });
};

const renderPreview = (el, data) => {
  const invalid = data.rows.filter((r) => !r.valid).length;
  el.innerHTML = `
    <article class="panel-card">
      <header class="panel-header">
        <h2>Preview — ${data.fileName}</h2>
        <span class="muted">${data.rows.length} rows · ${invalid} flagged</span>
      </header>
      <p class="hint">Detected columns: ${Object.keys(data.mapping).join(', ') || 'none — using first columns'}</p>
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr><th>#</th><th>Company</th><th>Domain</th><th>IP</th><th>URL</th><th>Valid</th></tr>
          </thead>
          <tbody>
            ${data.rows
              .slice(0, 50)
              .map(
                (r) => `<tr class="${r.valid ? '' : 'row-invalid'}">
              <td>${r.index}</td>
              <td>${r.company || '—'}</td>
              <td>${r.domain || '—'}</td>
              <td>${r.ip || '—'}</td>
              <td>${r.url || '—'}</td>
              <td>${r.valid ? badgeHtml('pass') : badgeHtml('warn', r.issues.join('; '))}</td>
            </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>
      <button type="button" class="btn btn-primary" id="run-sheet-checks">Run checks</button>
    </article>`;

  el.querySelector('#run-sheet-checks')?.addEventListener('click', () => runChecks(el, data));
};

const runChecks = async (previewEl, data) => {
  const resultsEl = previewEl.parentElement.querySelector('#sheet-results');
  resultsEl.innerHTML = loadingHtml('Running checks on each row…');
  checkResults = [];

  for (const row of data.rows) {
    if (!row.valid) {
      checkResults.push({ ...row, status: 'warn', detail: row.issues.join('; '), checks: {} });
      continue;
    }
    const target = row.domain || row.ip;
    if (!target) {
      checkResults.push({ ...row, status: 'skip', detail: 'No domain/IP', checks: {} });
      continue;
    }
    try {
      const result = await runDomainCheck(target);
      const status = result.summary.fail ? 'fail' : result.summary.warn ? 'warn' : 'pass';
      checkResults.push({ ...row, status, result, summary: result.summary });
    } catch (err) {
      checkResults.push({ ...row, status: 'fail', detail: err.message });
    }
  }

  const summary = checkResults.reduce(
    (acc, r) => {
      acc[r.status === 'pass' ? 'pass' : r.status === 'fail' ? 'fail' : r.status === 'skip' ? 'skip' : 'warn'] += 1;
      return acc;
    },
    { pass: 0, warn: 0, fail: 0, skip: 0, total: checkResults.length }
  );

  saveHistoryEntry({ testType: 'spreadsheet', target: data.fileName, summary });

  resultsEl.innerHTML = `
    <article class="panel-card">
      <header class="panel-header">
        <h2>Results</h2>
        <button type="button" class="btn btn-secondary btn-sm" id="export-sheet-csv">Export CSV</button>
      </header>
      <div class="summary-pills">
        ${badgeHtml('pass', `${summary.pass} pass`)}
        ${badgeHtml('warn', `${summary.warn} warn`)}
        ${badgeHtml('fail', `${summary.fail} fail`)}
      </div>
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr><th>#</th><th>Target</th><th>Company</th><th>Status</th><th>Pass</th><th>Warn</th><th>Fail</th></tr></thead>
          <tbody>
            ${checkResults
              .map(
                (r) => `<tr>
              <td>${r.index}</td>
              <td>${r.domain || r.ip || '—'}</td>
              <td>${r.company || '—'}</td>
              <td>${badgeHtml(r.status)}</td>
              <td>${r.summary?.pass ?? '—'}</td>
              <td>${r.summary?.warn ?? '—'}</td>
              <td>${r.summary?.fail ?? '—'}</td>
            </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>
    </article>`;

  resultsEl.querySelector('#export-sheet-csv')?.addEventListener('click', () => {
    exportCsv(`spreadsheet-results-${Date.now()}.csv`, checkResults, [
      { label: 'row', value: (r) => r.index },
      { label: 'company', value: (r) => r.company },
      { label: 'domain', value: (r) => r.domain },
      { label: 'ip', value: (r) => r.ip },
      { label: 'status', value: (r) => r.status },
      { label: 'pass', value: (r) => r.summary?.pass },
      { label: 'warn', value: (r) => r.summary?.warn },
      { label: 'fail', value: (r) => r.summary?.fail }
    ]);
  });
};

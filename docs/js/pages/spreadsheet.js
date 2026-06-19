import {
  handleFileUpload,
  revalidateDataset,
  buildValidationReport,
  validationReportToCsv,
  runBatch,
  suggestCheckMapping,
  SpreadsheetTable,
  CHECK_TYPE_LABELS,
  VALIDATION_TYPES,
  VALIDATION_TYPE_LABELS
} from '../spreadsheet/index.js';
import { runDomainCheck } from '../services/domain-client.js';
import { runSiteCheck } from '../services/site-client.js';
import { runPhoneTest } from '../services/phone-client.js';
import { saveHistoryEntry } from '../storage.js';
import { loadingHtml } from '../components/loading.js';
import { badgeHtml } from '../components/badges.js';
import { exportCsv, exportJson, downloadBlob } from '../components/export-buttons.js';

/** @type {object|null} */
let sheetState = null;
/** @type {SpreadsheetTable|null} */
let dataTable = null;
/** @type {AbortController|null} */
let batchAbort = null;

export const renderSpreadsheet = () => `
  <section class="page-header">
    <div>
      <p class="page-eyebrow">Bulk checks</p>
      <h1>Spreadsheet Upload</h1>
      <p class="page-desc">Upload CSV or XLSX, validate rows, map columns to domain, phone, and site checks, then run batch automation.</p>
    </div>
  </section>

  <div class="upload-zone" id="upload-zone">
    <input type="file" id="sheet-file" accept=".csv,.xlsx,.xls" hidden />
    <p>Drop <strong>.csv</strong> or <strong>.xlsx</strong> here, or <button type="button" class="link-btn" id="pick-file">browse</button></p>
    <p class="hint">Up to 50,000 rows · <a href="samples/domains-sample.csv" download>Download sample CSV</a> · <a href="samples/multi-check-sample.csv" download>Multi-check sample</a></p>
    <div class="progress-bar hidden" id="upload-progress"><div class="progress-fill" id="upload-progress-fill"></div></div>
  </div>

  <div id="sheet-errors"></div>
  <div id="sheet-controls" class="hidden"></div>
  <div id="sheet-preview"></div>
  <div id="sheet-results"></div>
`;

export const bindSpreadsheet = (root) => {
  const zone = root.querySelector('#upload-zone');
  const input = root.querySelector('#sheet-file');
  const errorsEl = root.querySelector('#sheet-errors');
  const controlsEl = root.querySelector('#sheet-controls');
  const preview = root.querySelector('#sheet-preview');
  const resultsEl = root.querySelector('#sheet-results');
  const progressBar = root.querySelector('#upload-progress');
  const progressFill = root.querySelector('#upload-progress-fill');

  root.querySelector('#pick-file')?.addEventListener('click', () => input.click());

  const setProgress = (pct) => {
    progressBar?.classList.toggle('hidden', pct >= 100);
    if (progressFill) progressFill.style.width = `${pct}%`;
  };

  const clearSheet = () => {
    sheetState = null;
    dataTable = null;
    batchAbort?.abort();
    batchAbort = null;
    errorsEl.innerHTML = '';
    resultsEl.innerHTML = '';
    controlsEl.classList.add('hidden');
    controlsEl.innerHTML = '';
    preview.innerHTML = '';
    if (input) input.value = '';
    setProgress(100);
  };

  const handleFile = async (file) => {
    if (!file) return;
    errorsEl.innerHTML = '';
    resultsEl.innerHTML = '';
    controlsEl.classList.add('hidden');
    preview.innerHTML = loadingHtml('Parsing and validating…');
    setProgress(5);

    try {
      const columnRules = sheetState?.columnRules ?? {};
      const data = await handleFileUpload(file, {
        columnRules,
        onProgress: setProgress
      });
      sheetState = {
        data,
        viewMode: 'raw',
        checkTypes: ['domain'],
        checkMapping: suggestCheckMapping(data.headers, data.columnMapping),
        columnRules
      };
      setProgress(100);
      renderControls(controlsEl, root);
      renderDataTable(preview, sheetState);
    } catch (err) {
      preview.innerHTML = '';
      errorsEl.innerHTML = `<div class="alert alert-error"><strong>Upload failed:</strong> ${err.message}</div>`;
      setProgress(100);
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

  const rerender = () => {
    if (!sheetState) return;
    renderControls(controlsEl, root);
    renderDataTable(preview, sheetState);
  };

  root._sheetRerender = rerender;
  root._sheetClear = clearSheet;
};

const validationTypeOptions = (selected) => {
  const opts = [{ value: '', label: VALIDATION_TYPE_LABELS.auto }];
  for (const type of Object.values(VALIDATION_TYPES)) {
    opts.push({ value: type, label: VALIDATION_TYPE_LABELS[type] ?? type });
  }
  return opts.map((o) =>
    `<option value="${o.value}" ${String(selected) === String(o.value) ? 'selected' : ''}>${o.label}</option>`
  ).join('');
};

const applyColumnRules = async (root) => {
  if (!sheetState) return;
  const preview = root.querySelector('#sheet-preview');
  preview.innerHTML = loadingHtml('Re-validating with updated column rules…');

  try {
    sheetState.data = await revalidateDataset(sheetState.data, sheetState.columnRules);
    renderControls(root.querySelector('#sheet-controls'), root);
    renderDataTable(preview, sheetState);
  } catch (err) {
    preview.innerHTML = '';
    root.querySelector('#sheet-errors').innerHTML =
      `<div class="alert alert-error"><strong>Validation failed:</strong> ${err.message}</div>`;
  }
};

const renderControls = (el, root) => {
  if (!sheetState) return;
  const { data, viewMode, checkTypes, checkMapping, columnRules } = sheetState;
  const invalid = data.summary?.invalid ?? 0;

  el.classList.remove('hidden');
  el.innerHTML = `
    <article class="panel-card sheet-controls-card">
      <header class="panel-header">
        <div>
          <h2>${data.fileName}</h2>
          <span class="muted">${data.summary.total.toLocaleString()} rows · ${invalid} invalid</span>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" id="clear-sheet">Clear &amp; upload new</button>
      </header>

      <div class="sheet-control-grid">
        <fieldset class="sheet-fieldset">
          <legend>View mode</legend>
          <div class="toggle-group">
            <button type="button" class="toggle-btn ${viewMode === 'raw' ? 'active' : ''}" data-view="raw">Raw View</button>
            <button type="button" class="toggle-btn ${viewMode === 'cleaned' ? 'active' : ''}" data-view="cleaned">Cleaned View</button>
          </div>
        </fieldset>

        <fieldset class="sheet-fieldset">
          <legend>Check types</legend>
          <div class="check-type-toggles">
            ${Object.entries(CHECK_TYPE_LABELS).map(([key, label]) => `
              <label class="check-toggle">
                <input type="checkbox" data-check-type="${key}" ${checkTypes.includes(key) ? 'checked' : ''} />
                ${label}
              </label>
            `).join('')}
          </div>
        </fieldset>

        <fieldset class="sheet-fieldset sheet-mapping">
          <legend>Column mapping</legend>
          <div class="mapping-grid">
            ${['domain', 'phone', 'site'].map((key) => `
              <label>
                ${CHECK_TYPE_LABELS[key === 'site' ? 'site' : key] ?? key}
                <select data-map="${key}">
                  <option value="">— not mapped —</option>
                  ${data.headers.map((h, i) => `
                    <option value="${i}" ${String(checkMapping[key]) === String(i) ? 'selected' : ''}>${h}</option>
                  `).join('')}
                </select>
              </label>
            `).join('')}
          </div>
        </fieldset>

        <fieldset class="sheet-fieldset sheet-column-rules">
          <legend>Column validation rules</legend>
          <p class="hint sheet-rules-hint">Override auto-detected types per column. Changes re-run validation.</p>
          <div class="column-rules-grid">
            ${data.headers.map((h, i) => {
              const inferred = data.columnMeta?.[i]?.inferredType ?? data.columnTypes?.[i]?.inferredType ?? 'string';
              const current = columnRules[i] ?? '';
              return `
                <label>
                  <span class="column-rule-name">${h}</span>
                  <span class="column-rule-inferred muted">detected: ${inferred}</span>
                  <select data-col-rule="${i}">
                    ${validationTypeOptions(current)}
                  </select>
                </label>
              `;
            }).join('')}
          </div>
        </fieldset>
      </div>

      <div class="sheet-actions">
        <button type="button" class="btn btn-primary" id="run-sheet-checks">Run batch checks</button>
        <button type="button" class="btn btn-secondary" id="export-cleaned">Export cleaned CSV</button>
        <button type="button" class="btn btn-secondary" id="export-validation-json">Validation report (JSON)</button>
        <button type="button" class="btn btn-secondary" id="export-validation-csv">Validation report (CSV)</button>
        ${batchAbort ? '<button type="button" class="btn btn-danger btn-sm" id="cancel-batch">Cancel</button>' : ''}
      </div>
    </article>
  `;

  el.querySelector('#clear-sheet')?.addEventListener('click', () => root._sheetClear?.());

  el.querySelectorAll('[data-view]').forEach((btn) => {
    btn.addEventListener('click', () => {
      sheetState.viewMode = btn.dataset.view;
      dataTable?.setData({ viewMode: sheetState.viewMode });
      renderControls(el, root);
    });
  });

  el.querySelectorAll('[data-check-type]').forEach((cb) => {
    cb.addEventListener('change', () => {
      const types = [...el.querySelectorAll('[data-check-type]:checked')].map((c) => c.dataset.checkType);
      sheetState.checkTypes = types.length ? types : ['domain'];
    });
  });

  el.querySelectorAll('[data-map]').forEach((sel) => {
    sel.addEventListener('change', () => {
      sheetState.checkMapping[sel.dataset.map] = sel.value === '' ? '' : Number(sel.value);
    });
  });

  el.querySelectorAll('[data-col-rule]').forEach((sel) => {
    sel.addEventListener('change', () => {
      const col = Number(sel.dataset.colRule);
      if (sel.value === '') delete sheetState.columnRules[col];
      else sheetState.columnRules[col] = sel.value;
      applyColumnRules(root);
    });
  });

  el.querySelector('#export-cleaned')?.addEventListener('click', () => exportCleanedData());
  el.querySelector('#export-validation-json')?.addEventListener('click', () => {
    const report = buildValidationReport(sheetState.data);
    exportJson(`validation-report-${Date.now()}.json`, report);
  });
  el.querySelector('#export-validation-csv')?.addEventListener('click', () => {
    const report = buildValidationReport(sheetState.data);
    downloadBlob(`validation-report-${Date.now()}.csv`, validationReportToCsv(report), 'text/csv');
  });

  el.querySelector('#run-sheet-checks')?.addEventListener('click', () => runChecks(root));
  el.querySelector('#cancel-batch')?.addEventListener('click', () => batchAbort?.abort());
};

const renderDataTable = (el, state) => {
  el.innerHTML = '<div id="sheet-table-host"></div>';
  const host = el.querySelector('#sheet-table-host');
  const rowCount = state.data.rows.length;
  dataTable = new SpreadsheetTable(host, {
    headers: state.data.headers,
    rows: state.data.rows,
    viewMode: state.viewMode,
    highlightErrors: true,
    usePagination: true,
    useVirtualScroll: rowCount > 500,
    pageSize: rowCount > 1000 ? 250 : 50
  });
};

const exportCleanedData = () => {
  if (!sheetState) return;
  const { headers, rows } = sheetState.data;
  const cleanedRows = rows.map((r) => ({
    cells: r.cleaned ?? r.cells,
    index: r.index
  }));
  const columns = [
    { label: 'row', value: (r) => r.index },
    ...headers.map((h, i) => ({ label: h, value: (r) => r.cells[i] }))
  ];
  exportCsv(`cleaned-${sheetState.data.fileName}-${Date.now()}.csv`, cleanedRows, columns);
};

const runChecks = async (root) => {
  if (!sheetState) return;
  const resultsEl = root.querySelector('#sheet-results');
  const controlsEl = root.querySelector('#sheet-controls');
  batchAbort = new AbortController();

  resultsEl.innerHTML = `
    <article class="panel-card">
      <header class="panel-header"><h2>Batch processing</h2></header>
      <div class="progress-bar" id="batch-progress"><div class="progress-fill" id="batch-progress-fill"></div></div>
      <p class="hint" id="batch-status">Starting…</p>
    </article>
  `;

  const fill = resultsEl.querySelector('#batch-progress-fill');
  const statusEl = resultsEl.querySelector('#batch-status');

  const { results, summary } = await runBatch({
    rows: sheetState.data.rows,
    checkTypes: sheetState.checkTypes,
    checkMapping: sheetState.checkMapping,
    viewMode: sheetState.viewMode,
    signal: batchAbort.signal,
    runners: { runDomainCheck, runSiteCheck, runPhoneTest },
    onProgress: ({ current, total, percent }) => {
      if (fill) fill.style.width = `${percent}%`;
      if (statusEl) statusEl.textContent = `Processing row ${current} of ${total} (${percent}%)`;
    }
  });

  batchAbort = null;
  sheetState.results = results;
  renderControls(controlsEl, root);

  saveHistoryEntry({
    testType: 'spreadsheet',
    target: sheetState.data.fileName,
    summary: { ...summary, checkTypes: sheetState.checkTypes }
  });

  const checkCols = sheetState.checkTypes;

  resultsEl.innerHTML = `
    <article class="panel-card">
      <header class="panel-header">
        <h2>Batch results</h2>
        <div class="sheet-results-actions">
          <button type="button" class="btn btn-secondary btn-sm" id="export-sheet-csv">Export CSV</button>
          <button type="button" class="btn btn-secondary btn-sm" id="export-sheet-json">Export JSON</button>
        </div>
      </header>
      <div class="summary-pills">
        ${badgeHtml('pass', `${summary.pass} pass`)}
        ${badgeHtml('warn', `${summary.warn} warn`)}
        ${badgeHtml('fail', `${summary.fail} fail`)}
        ${badgeHtml('skip', `${summary.skip} skip`)}
      </div>
      <div class="table-scroll sheet-results-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Company</th>
              <th>Domain/IP</th>
              <th>Phone</th>
              <th>Site</th>
              <th>Status</th>
              ${checkCols.includes('domain') ? '<th>Domain</th>' : ''}
              ${checkCols.includes('phone') ? '<th>Phone</th>' : ''}
              ${checkCols.includes('site') ? '<th>Site</th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${results.slice(0, 500).map((r) => `
              <tr class="${r.status === 'fail' ? 'row-invalid' : ''}">
                <td>${r.index}</td>
                <td>${r.company || '—'}</td>
                <td>${r.domain || r.ip || '—'}</td>
                <td>${r.phone || '—'}</td>
                <td>${r.site || '—'}</td>
                <td>${badgeHtml(r.status, r.detail || '')}</td>
                ${checkCols.includes('domain') ? `<td>${r.checks.domain ? badgeHtml(r.checks.domain.status) : '—'}</td>` : ''}
                ${checkCols.includes('phone') ? `<td>${r.checks.phone ? badgeHtml(r.checks.phone.status) : '—'}</td>` : ''}
                ${checkCols.includes('site') ? `<td>${r.checks.site ? badgeHtml(r.checks.site.status) : '—'}</td>` : ''}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      ${results.length > 500 ? `<p class="hint">Showing first 500 of ${results.length.toLocaleString()} results. Export for full data.</p>` : ''}
    </article>
  `;

  const batchExportColumns = [
    { label: 'row', value: (r) => r.index },
    { label: 'company', value: (r) => r.company },
    { label: 'domain', value: (r) => r.domain },
    { label: 'ip', value: (r) => r.ip },
    { label: 'phone', value: (r) => r.phone },
    { label: 'site', value: (r) => r.site },
    { label: 'status', value: (r) => r.status },
    { label: 'domain_check', value: (r) => r.checks.domain?.status },
    { label: 'phone_check', value: (r) => r.checks.phone?.status },
    { label: 'site_check', value: (r) => r.checks.site?.status },
    { label: 'detail', value: (r) => r.detail }
  ];

  resultsEl.querySelector('#export-sheet-csv')?.addEventListener('click', () => {
    exportCsv(`spreadsheet-results-${Date.now()}.csv`, results, batchExportColumns);
  });

  resultsEl.querySelector('#export-sheet-json')?.addEventListener('click', () => {
    exportJson(`spreadsheet-results-${Date.now()}.json`, {
      fileName: sheetState.data.fileName,
      generatedAt: new Date().toISOString(),
      checkTypes: sheetState.checkTypes,
      summary,
      results
    });
  });
};

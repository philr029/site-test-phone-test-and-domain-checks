/**
 * FileUpload — drag-and-drop upload with preview (first 50 rows) and progress.
 */
import { parseInWorker } from './ParserWorker.js';
import { MAX_FILE_SIZE, SUPPORTED_EXTENSIONS, PREVIEW_ROW_LIMIT } from './constants.js';

/**
 * @param {HTMLElement} container
 * @param {{ onParsed: (data: object) => void, onError: (err: Error) => void }} callbacks
 */
export const createFileUpload = (container, callbacks) => {
  const { onParsed, onError } = callbacks;

  container.innerHTML = `
    <div class="ingest-upload-zone" role="region" aria-label="File upload">
      <input type="file" class="ingest-file-input" accept=".csv,.xlsx,.xls" hidden aria-hidden="true" />
      <p class="ingest-upload-prompt">
        Drop <strong>.csv</strong> or <strong>.xlsx</strong> here, or
        <button type="button" class="link-btn ingest-browse-btn">browse</button>
      </p>
      <p class="hint">Preview shows first ${PREVIEW_ROW_LIMIT} rows · Max ${MAX_FILE_SIZE / (1024 * 1024)} MB</p>
      <div class="progress-bar hidden ingest-upload-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
        <div class="progress-fill ingest-upload-progress-fill"></div>
      </div>
      <div class="ingest-upload-status visually-hidden" aria-live="polite"></div>
    </div>
  `;

  const zone = container.querySelector('.ingest-upload-zone');
  const input = container.querySelector('.ingest-file-input');
  const progressBar = container.querySelector('.ingest-upload-progress');
  const progressFill = container.querySelector('.ingest-upload-progress-fill');
  const statusEl = container.querySelector('.ingest-upload-status');
  const browseBtn = container.querySelector('.ingest-browse-btn');

  const setProgress = (pct) => {
    progressBar?.classList.toggle('hidden', pct >= 100);
    if (progressBar) progressBar.setAttribute('aria-valuenow', String(pct));
    if (progressFill) progressFill.style.width = `${pct}%`;
    if (statusEl) {
      statusEl.textContent = pct < 100 ? `Parsing… ${pct}%` : '';
      statusEl.classList.toggle('visually-hidden', pct >= 100);
    }
  };

  const validateFile = (file) => {
    if (!file) throw new Error('No file selected.');
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`File exceeds ${MAX_FILE_SIZE / (1024 * 1024)} MB limit.`);
    }
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
      throw new Error(`Unsupported file type ".${ext}". Upload .csv or .xlsx.`);
    }
  };

  const handleFile = async (file) => {
    try {
      validateFile(file);
      setProgress(5);
      zone?.classList.add('processing');

      const parsed = await parseInWorker(file, { onProgress: setProgress });
      setProgress(100);
      zone?.classList.remove('processing');

      onParsed({
        fileName: parsed.fileName,
        headers: parsed.headers,
        previewRows: parsed.previewRows ?? parsed.rows,
        totalRows: parsed.totalRows ?? parsed.rows?.length ?? 0,
        allRows: parsed.rows
      });
    } catch (err) {
      setProgress(100);
      zone?.classList.remove('processing');
      onError(err instanceof Error ? err : new Error(String(err)));
    }
  };

  browseBtn?.addEventListener('click', () => input?.click());
  input?.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file) handleFile(file);
    if (input) input.value = '';
  });

  zone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('dragover');
  });
  zone?.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone?.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('dragover');
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  });

  return {
    reset: () => {
      setProgress(100);
      if (input) input.value = '';
    }
  };
};

/**
 * Render a preview table for the first N rows.
 * @param {string[]} headers
 * @param {string[][]} rows
 * @param {number} [limit]
 */
export const renderPreviewTable = (headers, rows, limit = PREVIEW_ROW_LIMIT) => {
  const slice = rows.slice(0, limit);
  const headHtml = headers.map((h) => `<th scope="col">${escapeHtml(h)}</th>`).join('');
  const bodyHtml = slice.map((row) =>
    `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`
  ).join('');

  return `
    <div class="ingest-preview-wrap">
      <p class="hint">Showing ${slice.length} of ${rows.length} preview rows</p>
      <div class="ingest-preview-scroll">
        <table class="data-table ingest-preview-table">
          <thead><tr>${headHtml}</tr></thead>
          <tbody>${bodyHtml}</tbody>
        </table>
      </div>
    </div>
  `;
};

const escapeHtml = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

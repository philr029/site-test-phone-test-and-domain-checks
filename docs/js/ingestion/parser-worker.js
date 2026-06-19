/**
 * Classic Web Worker: PapaParse (CSV streaming) + SheetJS (XLSX).
 * Loaded without module type so importScripts can pull CDN libraries.
 */
/* global Papa, XLSX */

importScripts(
  'https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js',
  'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js'
);

const PREVIEW_LIMIT_DEFAULT = 50;

const postProgress = (pct) => self.postMessage({ type: 'progress', payload: { pct } });

const parseCsvStreaming = (text, previewLimit) =>
  new Promise((resolve, reject) => {
    const previewRows = [];
    let headers = [];
    let totalRows = 0;

    Papa.parse(text, {
      header: false,
      skipEmptyLines: 'greedy',
      step: (result) => {
        if (!headers.length) {
          headers = result.data.map((h) => String(h ?? '').trim());
          return;
        }
        const cells = headers.map((_, i) => String(result.data[i] ?? '').trim());
        if (previewRows.length < previewLimit) previewRows.push(cells);
        totalRows++;
        if (totalRows % 500 === 0) {
          postProgress(Math.min(90, Math.round((totalRows / 10000) * 90)));
        }
      },
      complete: () => resolve({ headers, rows: previewRows, previewRows, totalRows }),
      error: (err) => reject(new Error(err.message))
    });
  });

const parseXlsxBuffer = (buffer, previewLimit) => {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { headers: [], rows: [], previewRows: [], totalRows: 0 };

  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (!data.length) return { headers: [], rows: [], previewRows: [], totalRows: 0 };

  const headers = data[0].map((h) => String(h ?? '').trim());
  const allRows = data.slice(1).map((row) => headers.map((_, i) => String(row[i] ?? '').trim()));
  const previewRows = allRows.slice(0, previewLimit);

  return { headers, rows: previewRows, previewRows, totalRows: allRows.length };
};

self.onmessage = async (e) => {
  const { type, payload } = e.data;

  try {
    if (type !== 'parse') {
      self.postMessage({ type: 'done', error: `Unknown message type: ${type}` });
      return;
    }

    postProgress(5);
    const { fileType, content, fileName, previewLimit = PREVIEW_LIMIT_DEFAULT } = payload;

    const parsed = fileType === 'csv'
      ? await parseCsvStreaming(content, previewLimit)
      : parseXlsxBuffer(content, previewLimit);

    postProgress(100);
    self.postMessage({ type: 'done', payload: { ...parsed, fileName } });
  } catch (err) {
    self.postMessage({ type: 'done', error: err.message || String(err) });
  }
};

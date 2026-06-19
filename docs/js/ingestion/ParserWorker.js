/**
 * ParserWorker — off-thread CSV/XLSX parsing via Web Worker.
 * Uses PapaParse for CSV (streaming for large files) and SheetJS for XLSX.
 */
import { PREVIEW_ROW_LIMIT } from './constants.js';

const workerUrl = new URL('./parser-worker.js', import.meta.url);

/**
 * Parse a file in a Web Worker.
 * @param {File} file
 * @param {{ onProgress?: (pct: number) => void }} [options]
 * @returns {Promise<{ headers: string[], rows: string[][], fileName: string, previewRows: string[][], totalRows: number }>}
 */
export const parseInWorker = (file, options = {}) =>
  new Promise((resolve, reject) => {
    const { onProgress } = options;
    const worker = new Worker(workerUrl);

    worker.onmessage = (e) => {
      const { type, payload, error } = e.data;
      if (type === 'progress') {
        onProgress?.(payload.pct);
        return;
      }
      worker.terminate();
      if (error) reject(new Error(error));
      else resolve(payload);
    };

    worker.onerror = (err) => {
      worker.terminate();
      reject(err);
    };

    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    const reader = new FileReader();

    reader.onload = () => {
      worker.postMessage({
        type: 'parse',
        payload: {
          fileName: file.name,
          fileType: ext === 'csv' ? 'csv' : 'xlsx',
          content: reader.result,
          previewLimit: PREVIEW_ROW_LIMIT
        }
      });
    };

    reader.onerror = () => {
      worker.terminate();
      reject(new Error('Failed to read file'));
    };

    if (ext === 'csv') reader.readAsText(file);
    else reader.readAsArrayBuffer(file);
  });

/**
 * Plain JS alternative — same API, synchronous parse for tests/small files.
 * @param {string} text
 * @param {{ Papa?: { parse: Function } }} [deps]
 */
export const parseCsvSync = (text, deps = {}) => {
  const Papa = deps.Papa ?? (typeof window !== 'undefined' ? window.Papa : null);
  if (!Papa?.parse) throw new Error('PapaParse not available');

  const result = Papa.parse(text, { header: false, skipEmptyLines: 'greedy' });
  const data = result.data ?? [];
  if (!data.length) return { headers: [], rows: [], previewRows: [], totalRows: 0 };

  const headers = data[0].map((h) => String(h ?? '').trim());
  const rows = data.slice(1).map((row) => headers.map((_, i) => String(row[i] ?? '').trim()));

  return {
    headers,
    rows,
    previewRows: rows.slice(0, PREVIEW_ROW_LIMIT),
    totalRows: rows.length
  };
};

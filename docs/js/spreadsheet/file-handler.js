/**
 * File upload handling — type detection, size limits, and worker orchestration.
 */
import { MAX_ROWS, WORKER_THRESHOLD } from './constants.js';
import { parseSpreadsheet } from './parser.js';
import { validateDataset } from './validation.js';

const SUPPORTED_EXTENSIONS = {
  csv: 'csv',
  xlsx: 'xlsx',
  xls: 'xlsx'
};

/**
 * @param {File} file
 */
export const detectFileType = (file) => {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const type = SUPPORTED_EXTENSIONS[ext];
  if (!type) {
    throw new Error(`Unsupported file type ".${ext}". Upload a .csv or .xlsx file.`);
  }
  return type;
};

/**
 * @param {File} file
 */
export const readFile = async (file) => {
  if (!file) throw new Error('No file selected.');
  if (file.size > 50 * 1024 * 1024) throw new Error('File exceeds 50 MB limit.');

  const type = detectFileType(file);
  const content = type === 'csv' ? await file.text() : await file.arrayBuffer();

  return { type, content, fileName: file.name, size: file.size };
};

/**
 * Process file with optional web worker for large datasets.
 * @param {File} file
 * @param {{ columnRules?: Record<number, string>, onProgress?: (n: number) => void }} [options]
 */
export const processUploadedFile = async (file, options = {}) => {
  const { columnRules = {}, onProgress } = options;
  const raw = await readFile(file);

  onProgress?.(10);

  let parsed;
  if (raw.type === 'csv' && raw.content.length > WORKER_THRESHOLD * 200) {
    parsed = await processInWorker(raw);
  } else {
    parsed = await parseSpreadsheet({
      type: raw.type,
      content: raw.content,
      fileName: raw.fileName
    });
  }

  onProgress?.(60);

  if (parsed.rowCount > MAX_ROWS) {
    throw new Error(`File has ${parsed.rowCount.toLocaleString()} rows. Maximum is ${MAX_ROWS.toLocaleString()}.`);
  }

  const validated = validateDataset(parsed, columnRules);
  onProgress?.(100);

  return validated;
};

/**
 * Offload CSV parse + validate to a web worker.
 * @param {{ type: string, content: string|ArrayBuffer, fileName: string }} raw
 */
const processInWorker = (raw) =>
  new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });

    worker.onmessage = (e) => {
      worker.terminate();
      if (e.data.error) reject(new Error(e.data.error));
      else resolve(e.data.result);
    };

    worker.onerror = (err) => {
      worker.terminate();
      reject(err);
    };

    worker.postMessage({
      type: 'process',
      payload: {
        fileType: raw.type,
        content: raw.type === 'csv' ? raw.content : null,
        fileName: raw.fileName
      }
    });
  });

/**
 * For XLSX large files: parse on main thread (SheetJS), validate in worker.
 * @param {object} parsed
 * @param {Record<number, string>} [columnRules]
 */
export const validateInWorker = (parsed, columnRules = {}) =>
  new Promise((resolve, reject) => {
    if (parsed.rows.length < WORKER_THRESHOLD) {
      resolve(validateDataset(parsed, columnRules));
      return;
    }

    const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      worker.terminate();
      if (e.data.error) reject(new Error(e.data.error));
      else resolve(e.data.result);
    };
    worker.onerror = (err) => {
      worker.terminate();
      reject(err);
    };
    worker.postMessage({ type: 'validate', payload: { parsed, columnRules } });
  });

/**
 * Full pipeline with worker fallback for XLSX validation.
 * @param {File} file
 * @param {object} [options]
 */
export const handleFileUpload = async (file, options = {}) => {
  const { columnRules = {}, onProgress } = options;
  const raw = await readFile(file);
  onProgress?.(10);

  const parsed = await parseSpreadsheet({
    type: raw.type,
    content: raw.content,
    fileName: raw.fileName
  });

  onProgress?.(40);

  if (parsed.rowCount > MAX_ROWS) {
    throw new Error(`File has ${parsed.rowCount.toLocaleString()} rows. Maximum is ${MAX_ROWS.toLocaleString()}.`);
  }

  const validated = await validateInWorker(parsed, columnRules);
  onProgress?.(100);
  return validated;
};

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
 * Offload CSV parse + validate to a web worker.
 * @param {{ type: string, content: string, fileName: string }} raw
 * @param {Record<number, string>} columnRules
 */
const processCsvInWorker = (raw, columnRules = {}) =>
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
        content: raw.content,
        fileName: raw.fileName,
        columnRules
      }
    });
  });

/**
 * Validate pre-parsed data in a web worker for large datasets.
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
 * Full upload pipeline with worker offload for large CSV (parse+validate) or XLSX (validate only).
 * @param {File} file
 * @param {{ columnRules?: Record<number, string>, onProgress?: (n: number) => void }} [options]
 */
export const handleFileUpload = async (file, options = {}) => {
  const { columnRules = {}, onProgress } = options;
  const raw = await readFile(file);
  onProgress?.(10);

  const useCsvWorker = raw.type === 'csv' && (
    typeof raw.content === 'string' && (
      raw.content.length > WORKER_THRESHOLD * 200 ||
      raw.content.split(/\r?\n/).length > WORKER_THRESHOLD
    )
  );

  let validated;
  if (useCsvWorker) {
    onProgress?.(30);
    validated = await processCsvInWorker(raw, columnRules);
  } else {
    const parsed = await parseSpreadsheet({
      type: raw.type,
      content: raw.content,
      fileName: raw.fileName
    });

    onProgress?.(40);

    if (parsed.rowCount > MAX_ROWS) {
      throw new Error(`File has ${parsed.rowCount.toLocaleString()} rows. Maximum is ${MAX_ROWS.toLocaleString()}.`);
    }

    validated = await validateInWorker(parsed, columnRules);
  }

  onProgress?.(90);

  if (validated.rowCount > MAX_ROWS) {
    throw new Error(`File has ${validated.rowCount.toLocaleString()} rows. Maximum is ${MAX_ROWS.toLocaleString()}.`);
  }

  onProgress?.(100);
  return validated;
};

/** @deprecated Use handleFileUpload — kept for backward compatibility */
export const processUploadedFile = handleFileUpload;

/**
 * Re-validate an existing dataset after column rule changes.
 * @param {object} dataset - Previously validated dataset
 * @param {Record<number, string>} columnRules
 */
export const revalidateDataset = async (dataset, columnRules = {}) => {
  const rawRows = dataset.rows.map((r) => r.cells);
  const parsed = {
    fileName: dataset.fileName,
    headers: dataset.headers,
    rows: rawRows,
    malformedRows: dataset.malformedRows ?? [],
    parseErrors: dataset.parseErrors ?? [],
    columnTypes: dataset.columnTypes ?? [],
    columnMapping: dataset.columnMapping ?? {},
    rowCount: rawRows.length
  };
  return validateInWorker(parsed, columnRules);
};

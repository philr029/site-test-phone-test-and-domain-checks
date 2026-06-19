/**
 * CSV / XLSX parsing with header detection, type inference, and malformed-row flags.
 */
import { COLUMN_ALIASES, normalizeHeader } from './constants.js';

const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;
const IPV6_RE = /^([0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
const URL_RE = /^https?:\/\/.+/i;
const PHONE_RE = /^\+?[\d\s().-]{7,20}$/;
const BOOL_RE = /^(true|false|yes|no|1|0)$/i;

/**
 * Parse CSV text using PapaParse when available, otherwise a built-in parser.
 * @param {string} text
 * @param {{ Papa?: { parse: Function } }} [deps]
 */
export const parseCsv = (text, deps = {}) => {
  const Papa = deps.Papa ?? (typeof window !== 'undefined' ? window.Papa : null);

  if (Papa?.parse) {
    const result = Papa.parse(text, {
      header: false,
      skipEmptyLines: 'greedy'
    });

    if (result.errors?.length) {
      const fatal = result.errors.filter((e) => e.type === 'Quotes' || e.type === 'FieldMismatch');
      if (fatal.length && !result.data?.length) {
        throw new Error(`CSV parse error: ${fatal[0].message}`);
      }
    }

    const data = result.data ?? [];
    if (!data.length) return { headers: [], rows: [], parseErrors: result.errors ?? [] };

    const headers = data[0].map((h) => String(h ?? '').trim());
    const rows = data.slice(1).map((row) => {
      const cells = headers.map((_, i) => String(row[i] ?? '').trim());
      return cells;
    });

    const malformedRows = data.slice(1)
      .map((row, i) => (row.length !== headers.length ? i : -1))
      .filter((i) => i >= 0);

    return {
      headers,
      rows,
      malformedRows,
      parseErrors: (result.errors ?? []).map((e) => ({
        row: e.row,
        message: e.message,
        type: e.type
      }))
    };
  }

  return parseCsvFallback(text);
};

/** Built-in CSV parser for tests and environments without PapaParse */
export const parseCsvFallback = (text) => {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { headers: [], rows: [], malformedRows: [], parseErrors: [] };

  const parseLine = (line) => {
    const cells = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        cells.push(cur.trim());
        cur = '';
      } else cur += ch;
    }
    cells.push(cur.trim());
    return cells.map((c) => c.replace(/^"|"$/g, '').replace(/""/g, '"'));
  };

  const headers = parseLine(lines[0]);
  const malformedRows = [];
  const rows = lines.slice(1).map((line, idx) => {
    const cells = parseLine(line);
    if (cells.length !== headers.length) malformedRows.push(idx);
    while (cells.length < headers.length) cells.push('');
    return cells.slice(0, headers.length);
  });

  return { headers, rows, malformedRows, parseErrors: [] };
};

/**
 * Parse XLSX from ArrayBuffer.
 * @param {ArrayBuffer} arrayBuffer
 * @param {{ XLSX?: object }} [deps]
 */
export const parseXlsx = async (arrayBuffer, deps = {}) => {
  const XLSX = deps.XLSX ?? (typeof window !== 'undefined' ? window.XLSX : null);
  if (!XLSX) throw new Error('XLSX library not loaded. Ensure SheetJS is included on the page.');

  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
  if (!wb.SheetNames?.length) throw new Error('Workbook contains no sheets.');

  const sheet = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
  if (!data.length) return { headers: [], rows: [], malformedRows: [], parseErrors: [] };

  const headers = data[0].map((h) => String(h ?? '').trim());
  const malformedRows = [];
  const rows = data.slice(1).map((row, idx) => {
    const arr = Array.isArray(row) ? row : [];
    if (arr.length !== headers.length && arr.some((c) => c !== '')) malformedRows.push(idx);
    return headers.map((_, i) => String(arr[i] ?? '').trim());
  });

  return { headers, rows, malformedRows, parseErrors: [] };
};

export const detectColumns = (headers) => {
  const mapping = {};
  headers.forEach((header, index) => {
    const norm = normalizeHeader(header);
    for (const [key, aliases] of Object.entries(COLUMN_ALIASES)) {
      if (aliases.includes(norm) && mapping[key] === undefined) mapping[key] = index;
    }
  });
  return mapping;
};

/** @param {string} value */
export const inferCellType = (value) => {
  const v = String(value ?? '').trim();
  if (!v) return 'empty';
  if (BOOL_RE.test(v)) return 'boolean';
  if (EMAIL_RE.test(v)) return 'email';
  if (URL_RE.test(v)) return 'url';
  if (IPV4_RE.test(v) || IPV6_RE.test(v)) return 'ip';
  if (DOMAIN_RE.test(v)) return 'domain';
  if (PHONE_RE.test(v) && /\d{7,}/.test(v.replace(/\D/g, ''))) return 'phone';
  if (!Number.isNaN(Number(v)) && v !== '') return 'number';
  return 'string';
};

/**
 * Infer dominant type per column from sample rows.
 * @param {string[]} headers
 * @param {string[][]} rows
 * @param {number} [sampleSize]
 */
export const detectColumnTypes = (headers, rows, sampleSize = 100) => {
  const sample = rows.slice(0, sampleSize);
  return headers.map((header, colIdx) => {
    const counts = {};
    for (const row of sample) {
      const t = inferCellType(row[colIdx]);
      if (t !== 'empty') counts[t] = (counts[t] || 0) + 1;
    }
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return {
      header,
      index: colIdx,
      inferredType: sorted[0]?.[0] ?? 'string',
      confidence: sample.length ? (sorted[0]?.[1] ?? 0) / sample.length : 0
    };
  });
};

/**
 * Full parse pipeline for raw file content.
 * @param {{ type: 'csv'|'xlsx', content: string|ArrayBuffer, fileName: string }} input
 * @param {{ Papa?: object, XLSX?: object }} [deps]
 */
export const parseSpreadsheet = async (input, deps = {}) => {
  let parsed;
  if (input.type === 'csv') {
    parsed = parseCsv(/** @type {string} */ (input.content), deps);
  } else if (input.type === 'xlsx') {
    parsed = await parseXlsx(/** @type {ArrayBuffer} */ (input.content), deps);
  } else {
    throw new Error(`Unsupported file type: ${input.type}`);
  }

  const { headers, rows, malformedRows = [], parseErrors = [] } = parsed;
  if (!headers.length) throw new Error('File has no header row.');

  return {
    fileName: input.fileName,
    headers,
    rows,
    malformedRows,
    parseErrors,
    columnTypes: detectColumnTypes(headers, rows),
    columnMapping: detectColumns(headers),
    rowCount: rows.length
  };
};

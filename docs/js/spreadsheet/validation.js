/**
 * Column- and row-level validation with cleaning helpers.
 */
import { VALIDATION_TYPES } from './constants.js';

const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;
const IPV6_RE = /^([0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
const URL_RE = /^https?:\/\/.+/i;
const PHONE_RE = /^\+[\d\s().-]{8,20}$/;
const BOOL_TRUE = /^(true|yes|1)$/i;
const BOOL_FALSE = /^(false|no|0)$/i;

/** @type {Record<string, (value: string) => string|null>} */
export const VALIDATORS = {
  [VALIDATION_TYPES.email]: (value) => {
    const v = value.trim();
    if (!v) return null;
    return EMAIL_RE.test(v) ? null : 'Invalid email format';
  },
  [VALIDATION_TYPES.domain]: (value) => {
    const v = value.trim().replace(/^https?:\/\//i, '').split('/')[0];
    if (!v) return null;
    return DOMAIN_RE.test(v) ? null : 'Invalid domain format';
  },
  [VALIDATION_TYPES.ip]: (value) => {
    const v = value.trim();
    if (!v) return null;
    if (IPV4_RE.test(v)) {
      const parts = v.split('.').map(Number);
      if (parts.some((p) => p > 255)) return 'Invalid IPv4 address';
      return null;
    }
    return IPV6_RE.test(v) ? null : 'Invalid IP address';
  },
  [VALIDATION_TYPES.phone]: (value) => {
    const v = value.trim();
    if (!v) return null;
    const digits = v.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15) return 'Invalid phone number';
    if (!PHONE_RE.test(v) && !/^[\d\s().-]{7,20}$/.test(v)) return 'Invalid phone format';
    return null;
  },
  [VALIDATION_TYPES.url]: (value) => {
    const v = value.trim();
    if (!v) return null;
    if (URL_RE.test(v)) return null;
    if (!v.includes(' ') && /^[\w.-]+\.[a-z]{2,}/i.test(v)) return 'URL should include http:// or https://';
    return 'Invalid URL format';
  },
  [VALIDATION_TYPES.numeric]: (value) => {
    const v = value.trim();
    if (!v) return null;
    return Number.isNaN(Number(v)) ? 'Expected a numeric value' : null;
  },
  [VALIDATION_TYPES.boolean]: (value) => {
    const v = value.trim();
    if (!v) return null;
    return BOOL_TRUE.test(v) || BOOL_FALSE.test(v) ? null : 'Expected true/false, yes/no, or 1/0';
  },
  [VALIDATION_TYPES.text]: () => null
};

/**
 * @param {string} value
 * @param {string} type
 */
export const validateCell = (value, type) => {
  const validator = VALIDATORS[type] ?? VALIDATORS.text;
  const message = validator(String(value ?? ''));
  return message ? { valid: false, message } : { valid: true, message: null };
};

/**
 * Clean a cell value based on validation type.
 * @param {string} value
 * @param {string} type
 */
export const cleanCell = (value, type) => {
  const v = String(value ?? '').trim();
  if (!v) return '';

  switch (type) {
    case VALIDATION_TYPES.domain:
      return v.replace(/^https?:\/\//i, '').split('/')[0].toLowerCase();
    case VALIDATION_TYPES.url:
      return URL_RE.test(v) ? v : `https://${v.replace(/^\/\//, '')}`;
    case VALIDATION_TYPES.phone:
      return v.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
    case VALIDATION_TYPES.boolean:
      return BOOL_TRUE.test(v) ? 'true' : BOOL_FALSE.test(v) ? 'false' : v;
    case VALIDATION_TYPES.numeric:
      return String(Number(v));
    case VALIDATION_TYPES.email:
      return v.toLowerCase();
    default:
      return v;
  }
};

/**
 * @param {string[]} cells
 * @param {Array<{ index: number, validationType?: string, inferredType?: string }>} columnMeta
 * @param {Set<number>} [malformedRows]
 * @param {number} rowIndex
 */
export const validateRow = (cells, columnMeta, malformedRows, rowIndex) => {
  const cellErrors = {};
  const issues = [];

  if (malformedRows?.has(rowIndex)) {
    issues.push('Malformed row (column count mismatch)');
  }

  columnMeta.forEach((col) => {
    const value = cells[col.index] ?? '';
    const type = col.validationType ?? mapInferredToValidation(col.inferredType);
    if (!value.trim() && type === VALIDATION_TYPES.text) return;

    const result = validateCell(value, type);
    if (!result.valid) {
      cellErrors[col.index] = result.message;
      issues.push(`${col.header || `Column ${col.index + 1}`}: ${result.message}`);
    }
  });

  const hasCheckableData = columnMeta.some((col) => {
    const type = col.validationType ?? mapInferredToValidation(col.inferredType);
    const value = (cells[col.index] ?? '').trim();
    return value && ['domain', 'ip', 'url', 'phone', 'email'].includes(type);
  });

  if (!hasCheckableData && !issues.length) {
    issues.push('No domain, IP, URL, phone, or email data in row');
  }

  return {
    valid: issues.length === 0,
    issues,
    cellErrors
  };
};

const mapInferredToValidation = (inferred) => {
  const map = {
    email: VALIDATION_TYPES.email,
    domain: VALIDATION_TYPES.domain,
    ip: VALIDATION_TYPES.ip,
    phone: VALIDATION_TYPES.phone,
    url: VALIDATION_TYPES.url,
    number: VALIDATION_TYPES.numeric,
    boolean: VALIDATION_TYPES.boolean
  };
  return map[inferred] ?? VALIDATION_TYPES.text;
};

/**
 * Validate entire dataset.
 * @param {object} dataset
 * @param {Record<number, string>} [columnRules] - col index -> validation type override
 */
export const validateDataset = (dataset, columnRules = {}) => {
  const { headers, rows, malformedRows = [], columnTypes = [] } = dataset;
  const malformedSet = new Set(malformedRows);

  const columnMeta = headers.map((header, index) => {
    const ct = columnTypes.find((c) => c.index === index) ?? { header, index, inferredType: 'string' };
    return {
      header,
      index,
      inferredType: ct.inferredType,
      validationType: columnRules[index] ?? mapInferredToValidation(ct.inferredType)
    };
  });

  const validatedRows = rows.map((cells, rowIndex) => {
    const validation = validateRow(cells, columnMeta, malformedSet, rowIndex);
    const cleaned = cells.map((cell, i) => {
      const type = columnMeta[i].validationType;
      return cleanCell(cell, type);
    });

    const mapped = extractMappedFields(cells, dataset.columnMapping);

    return {
      index: rowIndex + 1,
      cells,
      cleaned,
      ...mapped,
      ...validation
    };
  });

  const invalidCount = validatedRows.filter((r) => !r.valid).length;

  return {
    ...dataset,
    columnMeta,
    rows: validatedRows,
    summary: {
      total: validatedRows.length,
      valid: validatedRows.length - invalidCount,
      invalid: invalidCount,
      malformed: malformedRows.length
    }
  };
};

/**
 * Extract known fields from row using column mapping.
 * @param {string[]} cells
 * @param {Record<string, number>} mapping
 */
export const extractMappedFields = (cells, mapping = {}) => {
  const get = (key) => (mapping[key] !== undefined ? (cells[mapping[key]] ?? '').trim() : '');
  return {
    domain: get('domain'),
    ip: get('ip'),
    url: get('url') || get('website'),
    company: get('company'),
    phone: get('phone'),
    email: get('email')
  };
};

/**
 * Build downloadable validation report.
 * @param {object} validatedDataset
 */
export const buildValidationReport = (validatedDataset) => {
  const { fileName, headers, rows, summary, parseErrors = [], malformedRows = [] } = validatedDataset;

  return {
    fileName,
    generatedAt: new Date().toISOString(),
    summary,
    parseErrors,
    malformedRows,
    rows: rows.map((row) => ({
      row: row.index,
      valid: row.valid,
      issues: row.issues,
      cellErrors: row.cellErrors,
      cells: Object.fromEntries(headers.map((h, i) => [h, row.cells[i]]))
    }))
  };
};

/** @param {object} report */
export const validationReportToCsv = (report) => {
  const escape = (v) => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const headers = Object.keys(report.rows[0]?.cells ?? {});
  const lines = ['row,valid,issues,field,message'];
  for (const row of report.rows) {
    if (row.valid) {
      lines.push(`${row.row},true,,,`);
      continue;
    }
    const cellErrorEntries = Object.entries(row.cellErrors || {});
    if (!cellErrorEntries.length) {
      lines.push(`${row.row},false,${escape(row.issues.join('; '))},,`);
      continue;
    }
    for (const [colIdx, msg] of cellErrorEntries) {
      const field = headers[Number(colIdx)] ?? `column_${Number(colIdx) + 1}`;
      lines.push(`${row.row},false,${escape(row.issues.join('; '))},${escape(field)},${escape(msg)}`);
    }
  }
  return lines.join('\n');
};

/** Backward-compatible helper */
export const rowsToObjects = (headers, rows, mapping) => {
  const dataset = validateDataset({
    headers,
    rows,
    columnMapping: mapping,
    columnTypes: headers.map((h, i) => ({ header: h, index: i, inferredType: 'string' }))
  });
  return dataset.rows;
};

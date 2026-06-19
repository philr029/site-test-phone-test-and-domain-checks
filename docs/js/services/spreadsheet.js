/**
 * Backward-compatible re-exports for the spreadsheet engine.
 */
export {
  detectColumns,
  parseCsv,
  parseXlsx,
  parseSpreadsheet,
  validateDataset,
  buildValidationReport,
  validationReportToCsv,
  handleFileUpload,
  runBatch,
  suggestCheckMapping,
  rowsToObjects,
  SpreadsheetTable,
  CHECK_TYPES,
  CHECK_TYPE_LABELS,
  VALIDATION_TYPES
} from '../spreadsheet/index.js';

import { extractMappedFields } from '../spreadsheet/validation.js';

/** Legacy row validator — accepts a cells array and column mapping object */
export const validateRow = (cells, mapping) => {
  const fields = extractMappedFields(cells, mapping);
  const issues = [];
  if (!fields.domain && !fields.ip && !fields.url && !fields.phone) {
    issues.push('No domain, IP, URL, or phone');
  }
  if (fields.url && !/^https?:\/\//i.test(fields.url) && fields.url.includes(' ')) {
    issues.push('Invalid URL format');
  }
  if (fields.ip && !/^(\d{1,3}\.){3}\d{1,3}$/.test(fields.ip)) issues.push('Invalid IP format');
  return { ...fields, valid: issues.length === 0, issues };
};

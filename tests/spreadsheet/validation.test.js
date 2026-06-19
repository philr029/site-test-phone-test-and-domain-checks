import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateCell,
  validateRow,
  validateDataset,
  buildValidationReport,
  cleanCell,
  VALIDATORS
} from '../../docs/js/spreadsheet/validation.js';
import { VALIDATION_TYPES } from '../../docs/js/spreadsheet/constants.js';

describe('spreadsheet validation', () => {
  it('validateCell rejects invalid email', () => {
    const r = validateCell('not-email', VALIDATION_TYPES.email);
    assert.equal(r.valid, false);
    assert.match(r.message, /email/i);
  });

  it('validateCell accepts valid domain', () => {
    const r = validateCell('example.com', VALIDATION_TYPES.domain);
    assert.equal(r.valid, true);
  });

  it('validateCell rejects invalid IP octets', () => {
    const r = validateCell('999.1.1.1', VALIDATION_TYPES.ip);
    assert.equal(r.valid, false);
  });

  it('validateCell accepts boolean values', () => {
    assert.equal(validateCell('yes', VALIDATION_TYPES.boolean).valid, true);
    assert.equal(validateCell('maybe', VALIDATION_TYPES.boolean).valid, false);
  });

  it('cleanCell normalizes domain and url', () => {
    assert.equal(cleanCell('https://Example.COM/path', VALIDATION_TYPES.domain), 'example.com');
    assert.equal(cleanCell('example.com', VALIDATION_TYPES.url), 'https://example.com');
  });

  it('validateRow aggregates cell and row errors', () => {
    const columnMeta = [
      { header: 'domain', index: 0, validationType: VALIDATION_TYPES.domain },
      { header: 'email', index: 1, validationType: VALIDATION_TYPES.email }
    ];
    const result = validateRow(['bad domain', 'bad@'], columnMeta, new Set(), 0);
    assert.equal(result.valid, false);
    assert.ok(result.issues.length >= 1);
    assert.ok(result.cellErrors[0] || result.cellErrors[1]);
  });

  it('validateDataset produces summary counts', () => {
    const dataset = {
      headers: ['domain', 'email'],
      rows: [
        ['example.com', 'ok@example.com'],
        ['bad', 'not-email']
      ],
      columnTypes: [
        { header: 'domain', index: 0, inferredType: 'domain' },
        { header: 'email', index: 1, inferredType: 'email' }
      ],
      columnMapping: { domain: 0, email: 1 }
    };
    const result = validateDataset(dataset);
    assert.equal(result.summary.total, 2);
    assert.equal(result.summary.invalid, 1);
    assert.equal(result.rows[0].valid, true);
    assert.equal(result.rows[1].valid, false);
    assert.ok(result.rows[0].cleaned);
  });

  it('buildValidationReport is downloadable structure', () => {
    const dataset = validateDataset({
      headers: ['domain'],
      rows: [['example.com'], ['']],
      columnTypes: [{ header: 'domain', index: 0, inferredType: 'domain' }],
      columnMapping: { domain: 0 }
    });
    const report = buildValidationReport(dataset);
    assert.ok(report.generatedAt);
    assert.equal(report.rows.length, 2);
    assert.ok('valid' in report.rows[1]);
  });

  it('all validators handle empty values', () => {
    for (const fn of Object.values(VALIDATORS)) {
      assert.equal(fn(''), null);
    }
  });

  it('validateDataset respects columnRules overrides', () => {
    const dataset = {
      headers: ['host'],
      rows: [['example.com'], ['not-valid!!!']],
      columnTypes: [{ header: 'host', index: 0, inferredType: 'string' }],
      columnMapping: { domain: 0 }
    };
    const forced = validateDataset(dataset, { 0: VALIDATION_TYPES.domain });
    assert.equal(forced.rows[0].valid, true);
    assert.equal(forced.rows[1].valid, false);
    assert.ok(forced.rows[1].cellErrors[0]);
  });
});

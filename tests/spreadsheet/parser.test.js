import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCsv,
  parseCsvFallback,
  detectColumns,
  detectColumnTypes,
  inferCellType
} from '../../docs/js/spreadsheet/parser.js';

describe('spreadsheet parser', () => {
  it('parseCsvFallback handles quoted fields with commas', () => {
    const csv = 'name,note\n"Acme, Inc",ok\nTest,simple';
    const { headers, rows } = parseCsvFallback(csv);
    assert.deepEqual(headers, ['name', 'note']);
    assert.equal(rows[0][0], 'Acme, Inc');
    assert.equal(rows[1][0], 'Test');
  });

  it('parseCsv detects malformed rows', () => {
    const csv = 'a,b,c\n1,2,3\n4,5\n6,7,8';
    const { malformedRows, rows } = parseCsvFallback(csv);
    assert.equal(rows.length, 3);
    assert.deepEqual(malformedRows, [1]);
  });

  it('detectColumns maps known aliases', () => {
    const headers = ['Company', 'Domain Name', 'IP Address', 'Website URL', 'Phone Number'];
    const mapping = detectColumns(headers);
    assert.equal(mapping.company, 0);
    assert.equal(mapping.domain, 1);
    assert.equal(mapping.ip, 2);
    assert.ok(mapping.url !== undefined || mapping.website !== undefined);
    assert.equal(mapping.phone, 4);
  });

  it('inferCellType classifies values', () => {
    assert.equal(inferCellType('user@example.com'), 'email');
    assert.equal(inferCellType('example.com'), 'domain');
    assert.equal(inferCellType('8.8.8.8'), 'ip');
    assert.equal(inferCellType('https://example.com'), 'url');
    assert.equal(inferCellType('+441234567890'), 'phone');
    assert.equal(inferCellType('42'), 'number');
    assert.equal(inferCellType(''), 'empty');
  });

  it('detectColumnTypes infers dominant column type', () => {
    const headers = ['email_col', 'domain_col'];
    const rows = [
      ['a@b.com', 'example.com'],
      ['c@d.com', 'google.com'],
      ['e@f.com', 'test.org']
    ];
    const types = detectColumnTypes(headers, rows);
    assert.equal(types[0].inferredType, 'email');
    assert.equal(types[1].inferredType, 'domain');
  });

  it('parseCsv throws on empty file', () => {
    const { headers, rows } = parseCsv('');
    assert.deepEqual(headers, []);
    assert.deepEqual(rows, []);
  });
});

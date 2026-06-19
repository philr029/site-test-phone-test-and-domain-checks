import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsvSync } from '../../docs/js/ingestion/ParserWorker.js';
import { suggestMapping } from '../../docs/js/ingestion/ColumnMapper.js';
import { API_FIELDS } from '../../docs/js/ingestion/constants.js';

const mockPapa = {
  parse: (text, opts) => {
    const lines = text.split(/\r?\n/).filter(Boolean);
    const data = lines.map((line) => line.split(','));
    if (opts.step) {
      data.forEach((row) => opts.step({ data: row }));
    }
    if (opts.complete) opts.complete();
    return { data, errors: [] };
  }
};

describe('ingestion ParserWorker', () => {
  it('parseCsvSync returns headers, rows, and preview slice', () => {
    const csv = 'email,domain\na@x.com,x.com\nb@y.com,y.com\nc@z.com,z.com';
    const result = parseCsvSync(csv, { Papa: mockPapa });
    assert.deepEqual(result.headers, ['email', 'domain']);
    assert.equal(result.totalRows, 3);
    assert.equal(result.previewRows.length, 3);
  });

  it('parseCsvSync handles empty file', () => {
    const result = parseCsvSync('', { Papa: mockPapa });
    assert.deepEqual(result.headers, []);
    assert.equal(result.totalRows, 0);
  });
});

describe('ingestion ColumnMapper', () => {
  it('suggestMapping maps known headers', () => {
    const headers = ['Email Address', 'Domain', 'Phone Number', 'Company Name'];
    const mapping = suggestMapping(headers);
    assert.equal(mapping['Email Address'], 'email');
    assert.equal(mapping.Domain, 'domain');
    assert.equal(mapping['Phone Number'], 'phone');
    assert.equal(mapping['Company Name'], 'company');
  });

  it('API_FIELDS includes required ingestion fields', () => {
    assert.ok(API_FIELDS.includes('email'));
    assert.ok(API_FIELDS.includes('domain'));
    assert.ok(API_FIELDS.includes('phone'));
  });
});

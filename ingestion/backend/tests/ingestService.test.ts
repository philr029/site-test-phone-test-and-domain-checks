import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanRow,
  normalizeEmail,
  normalizeDomain,
  normalizePhone,
  validateCleanedRow,
  validateMapping,
  validateIngestPayload
} from '../src/services/ingestService.js';

describe('ingestService', () => {
  it('normalizes email, domain, and phone', () => {
    assert.equal(normalizeEmail('  A@X.COM '), 'a@x.com');
    assert.equal(normalizeDomain('HTTPS://Example.COM/path'), 'example.com');
    assert.equal(normalizePhone('(07700) 900-000'), '+07700900000');
  });

  it('cleans a mapped row', () => {
    const cleaned = cleanRow(
      { colA: 'a@x.com', colB: 'x.com', colC: '07700900000' },
      { colA: 'email', colB: 'domain', colC: 'phone' }
    );
    assert.equal(cleaned.email, 'a@x.com');
    assert.equal(cleaned.domain, 'x.com');
    assert.ok(cleaned.phone.startsWith('+'));
  });

  it('validates cleaned rows', () => {
    assert.equal(validateCleanedRow({ email: 'bad' }), 'invalid email format');
    assert.equal(validateCleanedRow({ domain: 'not a domain' }), 'invalid domain format');
    assert.equal(validateCleanedRow({ phone: 'abc' }), 'invalid phone format');
    assert.equal(validateCleanedRow({ email: 'ok@x.com' }), null);
  });

  it('validates mapping', () => {
    assert.equal(validateMapping({ a: 'email' }), null);
    assert.match(validateMapping({ a: 'bogus' })!, /Invalid API field/);
    assert.match(validateMapping({})!, /at least one/);
  });

  it('validates ingest payload', () => {
    const ok = validateIngestPayload({
      batchId: 'b1',
      mapping: { c: 'email' },
      rows: [{ c: 'a@b.com' }],
      idempotencyKey: 'key-1'
    });
    assert.equal(ok.ok, true);

    const bad = validateIngestPayload({ batchId: 'b1' });
    assert.equal(bad.ok, false);
  });
});

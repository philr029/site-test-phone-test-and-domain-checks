import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { request, startTestServer, stopTestServer } from './helpers/request.js';
import { clearTokens } from '../src/services/tokenService.js';
import { resetStore, closeStore } from '../src/services/store.js';

process.env.NODE_ENV = 'test';
process.env.INGEST_DB_PATH = ':memory:';

before(async () => {
  await startTestServer();
});

after(async () => {
  await stopTestServer();
  closeStore();
});

describe('POST /auth/upload-token', () => {
  beforeEach(() => clearTokens());

  it('returns a short-lived upload token', async () => {
    const res = await request('POST', '/auth/upload-token', {});
    assert.equal(res.status, 200);
    assert.ok(res.body.token);
    assert.ok(res.body.expiresAt);
    assert.ok(res.body.uploadSessionId);
  });

  it('accepts optional uploadSessionId', async () => {
    const res = await request('POST', '/auth/upload-token', { uploadSessionId: 'session-abc' });
    assert.equal(res.body.uploadSessionId, 'session-abc');
  });
});

describe('POST /ingest', () => {
  let token: string;

  before(async () => {
    clearTokens();
    resetStore();
    const auth = await request('POST', '/auth/upload-token', {});
    token = auth.body.token;
  });

  const sampleBatch = {
    batchId: 'batch-test-001',
    mapping: { colA: 'email', colB: 'domain', colC: 'phone' },
    rows: [
      { colA: 'a@x.com', colB: 'x.com', colC: '+447700900000' },
      { colA: 'bad-email', colB: 'x.com', colC: '+447700900001' }
    ],
    idempotencyKey: 'user-123-upload-20260619-1'
  };

  it('rejects requests without upload token', async () => {
    const res = await request('POST', '/ingest', sampleBatch);
    assert.equal(res.status, 401);
  });

  it('processes a valid batch', async () => {
    const res = await request('POST', '/ingest', sampleBatch, { 'x-upload-token': token });
    assert.equal(res.status, 200);
    assert.equal(res.body.batchId, 'batch-test-001');
    assert.equal(res.body.processed, 2);
    assert.equal(res.body.succeeded, 1);
    assert.equal(res.body.failed, 1);
    assert.ok(res.body.errors.some((e: { rowIndex: number }) => e.rowIndex === 1));
  });

  it('returns idempotent results for same batchId', async () => {
    const res = await request('POST', '/ingest', sampleBatch, { 'x-upload-token': token });
    assert.equal(res.status, 200);
    assert.equal(res.body.processed, 2);
  });

  it('validates mapping fields', async () => {
    const res = await request('POST', '/ingest', {
      ...sampleBatch,
      batchId: 'batch-invalid-mapping',
      mapping: { colA: 'notAField' }
    }, { 'x-upload-token': token });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /Invalid API field/);
  });
});

describe('GET /ingest/status/:batchId', () => {
  let token: string;

  before(async () => {
    const auth = await request('POST', '/auth/upload-token', {});
    token = auth.body.token;
    await request('POST', '/ingest', {
      batchId: 'status-batch-001',
      mapping: { email_col: 'email' },
      rows: [{ email_col: 'test@example.com' }],
      idempotencyKey: 'status-key-1'
    }, { 'x-upload-token': token });
  });

  it('returns batch status and row results', async () => {
    const res = await request('GET', '/ingest/status/status-batch-001', null, { 'x-upload-token': token });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'completed');
    assert.equal(res.body.succeeded, 1);
    assert.ok(res.body.rowResults.length >= 1);
  });

  it('returns 404 for unknown batch', async () => {
    const res = await request('GET', '/ingest/status/unknown-batch', null, { 'x-upload-token': token });
    assert.equal(res.status, 404);
  });
});

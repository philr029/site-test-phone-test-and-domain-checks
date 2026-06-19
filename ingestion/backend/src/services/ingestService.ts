import { randomUUID } from 'node:crypto';
import {
  API_FIELDS,
  type ApiField,
  type ColumnMapping,
  type IngestBatchRequest,
  type IngestBatchResponse,
  type IngestRow,
  type RowResult
} from '../types.js';
import {
  getIdempotentResult,
  getBatchStatus,
  saveRowResult,
  updateBatchProgress,
  upsertBatch
} from './store.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
const PHONE_RE = /^\+[\d]{7,15}$/;

/** Sanitize string input — strip control chars, trim */
export const sanitize = (value: unknown): string => {
  if (value == null) return '';
  return String(value).replace(/[\x00-\x1F\x7F]/g, '').trim();
};

export const normalizeEmail = (value: string) => sanitize(value).toLowerCase();
export const normalizeDomain = (value: string) =>
  sanitize(value).toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
export const normalizePhone = (value: string) => {
  const digits = sanitize(value).replace(/[^\d+]/g, '');
  if (!digits) return '';
  if (digits.startsWith('+')) return `+${digits.slice(1).replace(/\D/g, '')}`;
  return `+${digits.replace(/\D/g, '')}`;
};

export const cleanRow = (row: IngestRow, mapping: ColumnMapping): Record<string, string> => {
  const cleaned: Record<string, string> = {};
  for (const [col, field] of Object.entries(mapping)) {
    const raw = sanitize(row[col]);
    if (!raw) continue;
    if (field === 'email') cleaned.email = normalizeEmail(raw);
    else if (field === 'domain') cleaned.domain = normalizeDomain(raw);
    else if (field === 'phone') cleaned.phone = normalizePhone(raw);
    else if (field === 'url') cleaned.url = raw.startsWith('http') ? raw : `https://${raw}`;
    else cleaned[field] = raw;
  }
  return cleaned;
};

export const validateMapping = (mapping: ColumnMapping): string | null => {
  if (!mapping || typeof mapping !== 'object') return 'mapping must be an object';
  const values = Object.values(mapping);
  if (!values.length) return 'mapping must include at least one column';
  for (const field of values) {
    if (!API_FIELDS.includes(field as ApiField)) {
      return `Invalid API field: ${field}`;
    }
  }
  return null;
};

export const validateCleanedRow = (cleaned: Record<string, string>): string | null => {
  if (cleaned.email && !EMAIL_RE.test(cleaned.email)) return 'invalid email format';
  if (cleaned.domain && !DOMAIN_RE.test(cleaned.domain)) return 'invalid domain format';
  if (cleaned.phone && !PHONE_RE.test(cleaned.phone)) return 'invalid phone format';
  if (!Object.keys(cleaned).length) return 'row has no mapped values';
  return null;
};

/** Simulate external check with occasional transient failure (demo) */
const simulateExternalCheck = async (cleaned: Record<string, string>): Promise<void> => {
  if (process.env.SIMULATE_TRANSIENT === '1' && Math.random() < 0.1) {
    throw Object.assign(new Error('upstream timeout'), { transient: true });
  }
  await new Promise((r) => setTimeout(r, 5));
  if (process.env.SIMULATE_FAILURE === '1' && cleaned.domain === 'fail.example') {
    throw new Error('domain check failed');
  }
};

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 100;

const processRowWithRetry = async (
  row: IngestRow,
  mapping: ColumnMapping,
  rowIndex: number,
  idempotencyKey: string
): Promise<RowResult> => {
  const existing = getIdempotentResult(idempotencyKey);
  if (existing) return existing;

  const cleaned = cleanRow(row, mapping);
  const validationError = validateCleanedRow(cleaned);
  if (validationError) {
    return { rowIndex, status: 'failed', cleaned, error: validationError, idempotencyKey };
  }

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      await simulateExternalCheck(cleaned);
      return { rowIndex, status: 'success', cleaned, idempotencyKey };
    } catch (err) {
      const isTransient = (err as { transient?: boolean }).transient;
      if (!isTransient || attempt === MAX_RETRIES - 1) {
        return {
          rowIndex,
          status: 'failed',
          cleaned,
          error: (err as Error).message,
          idempotencyKey
        };
      }
      await new Promise((r) => setTimeout(r, BASE_DELAY_MS * 2 ** attempt));
    }
  }

  return { rowIndex, status: 'failed', cleaned, error: 'max retries exceeded', idempotencyKey };
};

export const validateIngestPayload = (body: unknown): { ok: true; data: IngestBatchRequest } | { ok: false; error: string } => {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Request body required' };
  const { batchId, mapping, rows, idempotencyKey } = body as IngestBatchRequest;

  if (!batchId || typeof batchId !== 'string') return { ok: false, error: 'batchId is required' };
  if (!idempotencyKey || typeof idempotencyKey !== 'string') {
    return { ok: false, error: 'idempotencyKey is required' };
  }
  const mappingError = validateMapping(mapping);
  if (mappingError) return { ok: false, error: mappingError };
  if (!Array.isArray(rows) || !rows.length) return { ok: false, error: 'rows must be a non-empty array' };
  if (rows.length > 1000) return { ok: false, error: 'Maximum 1000 rows per batch' };

  return { ok: true, data: { batchId, mapping, rows, idempotencyKey } };
};

/**
 * Process a batch of rows with concurrency limit.
 * Returns immediately with summary; heavy work runs inline for demo (queue in production).
 */
export const processBatch = async (
  request: IngestBatchRequest,
  concurrency = Number(process.env.INGEST_CONCURRENCY || 5)
): Promise<IngestBatchResponse> => {
  const { batchId, mapping, rows, idempotencyKey } = request;

  const existing = getBatchStatus(batchId);
  if (existing?.status === 'completed') {
    return {
      batchId,
      processed: existing.processed,
      succeeded: existing.succeeded,
      failed: existing.failed,
      errors: existing.errors
    };
  }

  upsertBatch(batchId, rows.length, 'processing');

  const results: RowResult[] = [];
  let succeeded = 0;
  let failed = 0;
  const errors: IngestBatchResponse['errors'] = [];

  const processChunk = async (chunk: IngestRow[], startIndex: number) => {
    const chunkResults = await Promise.all(
      chunk.map((row, i) => {
        const rowIndex = startIndex + i;
        const rowKey = `${idempotencyKey}-row-${rowIndex}`;
        return processRowWithRetry(row, mapping, rowIndex, rowKey);
      })
    );
    for (const result of chunkResults) {
      results.push(result);
      saveRowResult(batchId, result);
      if (result.status === 'success') succeeded++;
      else {
        failed++;
        if (result.error) errors.push({ rowIndex: result.rowIndex, error: result.error });
      }
    }
    updateBatchProgress(batchId, results.length, succeeded, failed, 'processing');
  };

  for (let i = 0; i < rows.length; i += concurrency) {
    await processChunk(rows.slice(i, i + concurrency), i);
  }

  updateBatchProgress(batchId, rows.length, succeeded, failed, 'completed');

  return { batchId, processed: rows.length, succeeded, failed, errors };
};

export const newBatchId = () => randomUUID();

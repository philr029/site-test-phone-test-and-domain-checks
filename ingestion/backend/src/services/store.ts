import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BatchStatus, RowResult, RowError } from '../types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.INGEST_DB_PATH || path.join(__dirname, '../../data/ingest.db');

let db: Database.Database | null = null;

export const getDb = () => {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.exec(`
      CREATE TABLE IF NOT EXISTS batches (
        batch_id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        total INTEGER NOT NULL DEFAULT 0,
        processed INTEGER NOT NULL DEFAULT 0,
        succeeded INTEGER NOT NULL DEFAULT 0,
        failed INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS row_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_id TEXT NOT NULL,
        row_index INTEGER NOT NULL,
        status TEXT NOT NULL,
        cleaned TEXT,
        error TEXT,
        idempotency_key TEXT UNIQUE,
        FOREIGN KEY (batch_id) REFERENCES batches(batch_id)
      );
      CREATE INDEX IF NOT EXISTS idx_row_idempotency ON row_results(idempotency_key);
      CREATE INDEX IF NOT EXISTS idx_row_batch ON row_results(batch_id);
    `);
  }
  return db;
};

export const upsertBatch = (batchId: string, total: number, status: BatchStatus['status'] = 'pending') => {
  getDb().prepare(`
    INSERT INTO batches (batch_id, status, total)
    VALUES (?, ?, ?)
    ON CONFLICT(batch_id) DO UPDATE SET total = excluded.total
  `).run(batchId, status, total);
};

export const updateBatchProgress = (
  batchId: string,
  processed: number,
  succeeded: number,
  failed: number,
  status: BatchStatus['status']
) => {
  getDb().prepare(`
    UPDATE batches SET processed = ?, succeeded = ?, failed = ?, status = ?
    WHERE batch_id = ?
  `).run(processed, succeeded, failed, status, batchId);
};

export const saveRowResult = (batchId: string, result: RowResult) => {
  getDb().prepare(`
    INSERT INTO row_results (batch_id, row_index, status, cleaned, error, idempotency_key)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(idempotency_key) DO NOTHING
  `).run(
    batchId,
    result.rowIndex,
    result.status,
    result.cleaned ? JSON.stringify(result.cleaned) : null,
    result.error ?? null,
    result.idempotencyKey ?? null
  );
};

export const getIdempotentResult = (idempotencyKey: string): RowResult | null => {
  const row = getDb().prepare(`
    SELECT row_index, status, cleaned, error, idempotency_key
    FROM row_results WHERE idempotency_key = ?
  `).get(idempotencyKey) as {
    row_index: number;
    status: string;
    cleaned: string | null;
    error: string | null;
    idempotency_key: string;
  } | undefined;

  if (!row) return null;
  return {
    rowIndex: row.row_index,
    status: row.status as RowResult['status'],
    cleaned: row.cleaned ? JSON.parse(row.cleaned) : undefined,
    error: row.error ?? undefined,
    idempotencyKey: row.idempotency_key
  };
};

export const getBatchStatus = (batchId: string): BatchStatus | null => {
  const batch = getDb().prepare(`
    SELECT batch_id, status, total, processed, succeeded, failed
    FROM batches WHERE batch_id = ?
  `).get(batchId) as {
    batch_id: string;
    status: string;
    total: number;
    processed: number;
    succeeded: number;
    failed: number;
  } | undefined;

  if (!batch) return null;

  const rows = getDb().prepare(`
    SELECT row_index, status, cleaned, error, idempotency_key
    FROM row_results WHERE batch_id = ? ORDER BY row_index
  `).all(batchId) as Array<{
    row_index: number;
    status: string;
    cleaned: string | null;
    error: string | null;
    idempotency_key: string | null;
  }>;

  const errors: RowError[] = rows
    .filter((r) => r.status === 'failed' && r.error)
    .map((r) => ({ rowIndex: r.row_index, error: r.error! }));

  return {
    batchId: batch.batch_id,
    status: batch.status as BatchStatus['status'],
    total: batch.total,
    processed: batch.processed,
    succeeded: batch.succeeded,
    failed: batch.failed,
    errors,
    rowResults: rows.map((r) => ({
      rowIndex: r.row_index,
      status: r.status as RowResult['status'],
      cleaned: r.cleaned ? JSON.parse(r.cleaned) : undefined,
      error: r.error ?? undefined,
      idempotencyKey: r.idempotency_key ?? undefined
    }))
  };
};

/** Reset DB for tests */
export const resetStore = () => {
  if (db) {
    db.exec('DELETE FROM row_results; DELETE FROM batches;');
  }
};

export const closeStore = () => {
  db?.close();
  db = null;
};

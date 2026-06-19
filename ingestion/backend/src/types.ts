/** API field names accepted by the ingestion endpoint */
export const API_FIELDS = ['email', 'domain', 'phone', 'url', 'company', 'ip'] as const;
export type ApiField = (typeof API_FIELDS)[number];

export type ColumnMapping = Record<string, ApiField>;

export interface IngestRow {
  [column: string]: string;
}

export interface IngestBatchRequest {
  batchId: string;
  mapping: ColumnMapping;
  rows: IngestRow[];
  idempotencyKey: string;
}

export interface RowError {
  rowIndex: number;
  error: string;
  transient?: boolean;
}

export interface IngestBatchResponse {
  batchId: string;
  processed: number;
  succeeded: number;
  failed: number;
  errors: RowError[];
}

export interface BatchStatus {
  batchId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  processed: number;
  succeeded: number;
  failed: number;
  total: number;
  errors: RowError[];
  rowResults: RowResult[];
}

export interface RowResult {
  rowIndex: number;
  status: 'success' | 'failed' | 'pending';
  cleaned?: Record<string, string>;
  error?: string;
  idempotencyKey?: string;
}

export interface UploadTokenPayload {
  token: string;
  expiresAt: string;
  uploadSessionId: string;
}

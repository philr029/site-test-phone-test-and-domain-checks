/**
 * Ingestion API client — short-lived token flow, never embed long-lived keys.
 */
import { INGEST_API_BASE } from '../ingestion/constants.js';

const base = () => INGEST_API_BASE().replace(/\/$/, '');

/**
 * Request a short-lived upload token from the backend.
 * @param {{ uploadSessionId?: string }} [options]
 */
export const requestUploadToken = async (options = {}) => {
  const res = await fetch(`${base()}/auth/upload-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Token request failed (${res.status})`);
  }
  return res.json();
};

/**
 * Send a batch to the ingestion endpoint.
 * @param {object} batch - { batchId, mapping, rows, idempotencyKey }
 * @param {string} uploadToken
 */
export const ingestBatch = async (batch, uploadToken) => {
  const res = await fetch(`${base()}/ingest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-upload-token': uploadToken
    },
    body: JSON.stringify(batch)
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Ingest failed (${res.status})`);
  return body;
};

/**
 * Poll batch status.
 * @param {string} batchId
 * @param {string} uploadToken
 */
export const getBatchStatus = async (batchId, uploadToken) => {
  const res = await fetch(`${base()}/ingest/status/${encodeURIComponent(batchId)}`, {
    headers: { 'x-upload-token': uploadToken }
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Status request failed (${res.status})`);
  return body;
};

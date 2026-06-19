import { Router, type Request, type Response } from 'express';
import { processBatch, validateIngestPayload } from '../services/ingestService.js';
import { getBatchStatus } from '../services/store.js';
import { requireUploadToken } from '../middleware/auth.js';

export const ingestRouter = Router();

/**
 * POST /ingest
 * Accept JSON batches with mapping, rows, and idempotency key.
 */
ingestRouter.post('/', requireUploadToken, async (req: Request, res: Response) => {
  const validation = validateIngestPayload(req.body);
  if (!validation.ok) {
    res.status(400).json({ error: validation.error });
    return;
  }

  try {
    const result = await processBatch(validation.data);
    res.json(result);
  } catch (err) {
    console.error('[ingest] batch error:', (err as Error).message);
    res.status(500).json({ error: 'Batch processing failed' });
  }
});

/**
 * GET /ingest/status/:batchId
 * Returns processing status and per-row results.
 */
ingestRouter.get('/status/:batchId', requireUploadToken, (req: Request, res: Response) => {
  const status = getBatchStatus(req.params.batchId);
  if (!status) {
    res.status(404).json({ error: 'Batch not found' });
    return;
  }
  res.json(status);
});

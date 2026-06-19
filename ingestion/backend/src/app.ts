import express from 'express';
import cors from 'cors';
import { authRouter } from './routes/auth.js';
import { ingestRouter } from './routes/ingest.js';
import { authRateLimit, ingestRateLimit } from './middleware/rateLimit.js';

export const createApp = () => {
  const app = express();

  app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
  app.use(express.json({ limit: '2mb' }));

  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'ingestion-api' });
  });

  app.use('/auth', authRateLimit, authRouter);
  app.use('/ingest', ingestRateLimit, ingestRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[server]', err.message);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
};

const app = createApp();
export default app;

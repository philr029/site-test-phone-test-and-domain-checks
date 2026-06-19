import { Router, type Request, type Response } from 'express';
import { issueUploadToken } from '../services/tokenService.js';

export const authRouter = Router();

/**
 * POST /auth/upload-token
 * Returns a short-lived token for client uploads. Never expose long-lived API keys to the browser.
 */
authRouter.post('/upload-token', (req: Request, res: Response) => {
  const uploadSessionId = typeof req.body?.uploadSessionId === 'string'
    ? req.body.uploadSessionId
    : undefined;

  const payload = issueUploadToken(uploadSessionId);
  res.json(payload);
});

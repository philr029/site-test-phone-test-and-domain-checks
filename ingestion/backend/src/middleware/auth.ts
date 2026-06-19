import { Router, type Request, type Response, type NextFunction } from 'express';
import { validateUploadToken } from '../services/tokenService.js';

export const requireUploadToken = (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers['x-upload-token'] as string | undefined;
  const result = validateUploadToken(token);
  if (!result.valid) {
    res.status(401).json({ error: result.reason });
    return;
  }
  next();
};

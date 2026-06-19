import rateLimit from 'express-rate-limit';

export const ingestRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.INGEST_RATE_LIMIT || 60),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate limit exceeded. Try again later.' }
});

export const authRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.AUTH_RATE_LIMIT || 30),
  message: { error: 'Too many token requests.' }
});

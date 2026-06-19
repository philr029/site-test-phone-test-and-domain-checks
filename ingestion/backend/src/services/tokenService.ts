import { randomUUID } from 'node:crypto';

interface TokenRecord {
  token: string;
  uploadSessionId: string;
  expiresAt: number;
}

const TOKEN_TTL_MS = Number(process.env.UPLOAD_TOKEN_TTL_MS || 15 * 60 * 1000);

/** In-memory token store — swap for Redis in production */
const tokens = new Map<string, TokenRecord>();

export const issueUploadToken = (uploadSessionId = randomUUID()) => {
  const token = randomUUID();
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  tokens.set(token, { token, uploadSessionId, expiresAt });
  return {
    token,
    uploadSessionId,
    expiresAt: new Date(expiresAt).toISOString()
  };
};

export const validateUploadToken = (token: string | undefined): { valid: boolean; reason?: string } => {
  if (!token) return { valid: false, reason: 'Missing upload token' };
  const record = tokens.get(token);
  if (!record) return { valid: false, reason: 'Invalid upload token' };
  if (Date.now() > record.expiresAt) {
    tokens.delete(token);
    return { valid: false, reason: 'Upload token expired' };
  }
  return { valid: true };
};

export const revokeUploadToken = (token: string) => {
  tokens.delete(token);
};

/** Test helper */
export const clearTokens = () => tokens.clear();

import { API_BASE } from '../config.js';

let apiAvailable = null;

export const checkApiHealth = async () => {
  try {
    const res = await fetch(`${API_BASE}/api/health`, { signal: AbortSignal.timeout(2500) });
    if (!res.ok) return false;
    const data = await res.json();
    apiAvailable = Boolean(data.ok);
    return data;
  } catch {
    apiAvailable = false;
    return null;
  }
};

export const isApiAvailable = () => apiAvailable === true;

export const apiPost = async (path, body) => {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `API error ${res.status}`);
  return data;
};

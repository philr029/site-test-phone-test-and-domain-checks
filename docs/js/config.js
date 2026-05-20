/** API base URL — local dev API or mock-only on static GitHub Pages */
export const API_BASE =
  (typeof window !== 'undefined' && window.QA_API_BASE) ||
  localStorage.getItem('qa-api-base') ||
  'http://127.0.0.1:3847';

export const setApiBase = (url) => {
  localStorage.setItem('qa-api-base', url);
  window.location.reload();
};

export const STORAGE_KEYS = {
  history: 'qa-dashboard-history',
  stats: 'qa-dashboard-stats',
  settings: 'qa-dashboard-settings',
  theme: 'qa-dashboard-theme'
};

export const SAMPLE_DOMAINS = ['example.com', 'google.com', 'cloudflare.com'];
export const SAMPLE_IPS = ['8.8.8.8', '1.1.1.1'];

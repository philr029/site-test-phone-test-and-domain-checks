import { apiPost, isApiAvailable } from './api-client.js';
import { summarizeChecks } from '../components/badges.js';

/** Mock site checks when API unavailable (GitHub Pages static mode) */
export const runSiteCheckMock = (url) => {
  const normalized = url.startsWith('http') ? url : `https://${url}`;
  const host = new URL(normalized).hostname;
  const checks = [
    { id: 'page-load', name: 'Page load', status: 'warn', detail: 'Connect local API (npm run dev:api) for live HTTP checks' },
    { id: 'form', name: 'Form test', status: 'skip', detail: 'Use npm run test:form-popup for Playwright form tests' },
    { id: 'popup', name: 'Popup test', status: 'skip', detail: 'Configure popupChecks in config/targets.json' },
    { id: 'banner', name: 'Banner test', status: 'skip', detail: 'Mock mode — API required for HTML analysis' },
    { id: 'broken-links', name: 'Broken link check', status: 'skip', detail: 'Mock mode' }
  ];
  return {
    url: normalized,
    host,
    mode: 'mock',
    checks,
    summary: summarizeChecks(checks),
    checkedAt: new Date().toISOString()
  };
};

export const runSiteCheck = async (url) => {
  if (isApiAvailable()) {
    return apiPost('/api/site/check', { url });
  }
  return runSiteCheckMock(url);
};

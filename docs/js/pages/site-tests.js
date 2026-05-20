import { runSiteCheck } from '../services/site-client.js';
import { saveHistoryEntry } from '../storage.js';
import { loadingHtml, emptyStateHtml } from '../components/loading.js';
import { resultCardHtml } from '../components/result-card.js';
import { badgeHtml } from '../components/badges.js';

const TEST_CARDS = [
  { id: 'form', name: 'Form tests', icon: '📝', desc: 'Detect forms and validation in page HTML' },
  { id: 'popup', name: 'Popup tests', icon: '🪟', desc: 'Cookie banners, modals, newsletter blocks' },
  { id: 'banner', name: 'Banner tests', icon: '📢', desc: 'Hero and announcement content' },
  { id: 'page-load', name: 'Page load', icon: '⏱', desc: 'Response time and HTTP status' },
  { id: 'broken-links', name: 'Broken links', icon: '🔗', desc: 'Sample internal links for HTTP errors' }
];

export const renderSiteTests = () => `
  <section class="page-header">
    <div>
      <p class="page-eyebrow">Website</p>
      <h1>Site Tests</h1>
      <p class="page-desc">Enter a URL to run form, popup, banner, page load, and link checks.</p>
    </div>
  </section>
  <div class="test-type-grid">
    ${TEST_CARDS.map(
      (c) => `
      <article class="test-type-card">
        <span class="test-type-icon">${c.icon}</span>
        <h3>${c.name}</h3>
        <p>${c.desc}</p>
      </article>`
    ).join('')}
  </div>
  <form class="check-form" id="site-check-form">
    <label for="site-url">Website URL</label>
    <div class="input-row">
      <input type="url" id="site-url" name="url" placeholder="https://www.example.com" required />
      <button type="submit" class="btn btn-primary">Run checks</button>
    </div>
  </form>
  <div id="site-results">
    ${emptyStateHtml({
      icon: '🌐',
      title: 'No results yet',
      message: 'Enter a URL above and run checks. For full Playwright tests use npm run test:form-popup.'
    })}
  </div>
`;

export const bindSiteTests = (root) => {
  const form = root.querySelector('#site-check-form');
  const results = root.querySelector('#site-results');

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = form.url.value.trim();
    results.innerHTML = loadingHtml('Running site checks…');
    try {
      const data = await runSiteCheck(url);
      const overall =
        data.summary.fail > 0 ? 'fail' : data.summary.warn > 0 ? 'warn' : 'pass';
      saveHistoryEntry({
        testType: 'site',
        target: data.url,
        summary: data.summary
      });
      results.innerHTML = resultCardHtml({
        title: data.url,
        subtitle: data.mode === 'mock' ? 'Mock mode' : `Loaded in ${data.loadMs || '—'}ms`,
        status: overall,
        checks: data.checks
      });
    } catch (err) {
      results.innerHTML = `<div class="alert alert-error">${err.message}</div>`;
    }
  });
};

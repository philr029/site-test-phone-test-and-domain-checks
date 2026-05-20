import { runDomainCheck } from '../services/domain-client.js';
import { saveHistoryEntry } from '../storage.js';
import { SAMPLE_DOMAINS, SAMPLE_IPS } from '../config.js';
import { loadingHtml, emptyStateHtml } from '../components/loading.js';
import { resultCardHtml } from '../components/result-card.js';

const CHECK_LABELS = [
  'Domain status',
  'DNS records',
  'MX records',
  'SPF',
  'DKIM',
  'DMARC',
  'Blacklist',
  'SSL certificate',
  'IP reputation'
];

export const renderDomainChecks = () => `
  <section class="page-header">
    <div>
      <p class="page-eyebrow">DNS & email</p>
      <h1>Domain &amp; IP Checks</h1>
      <p class="page-desc">Paste a domain or IP for MX, SPF, DMARC, SSL, and reputation placeholders.</p>
    </div>
  </section>
  <div class="sample-chips">
    <span class="muted">Samples:</span>
    ${[...SAMPLE_DOMAINS, ...SAMPLE_IPS].map((s) => `<button type="button" class="chip" data-sample="${s}">${s}</button>`).join('')}
  </div>
  <ul class="check-legend">${CHECK_LABELS.map((l) => `<li>${l}</li>`).join('')}</ul>
  <form class="check-form" id="domain-check-form">
    <label for="domain-target">Domain or IP</label>
    <div class="input-row">
      <input type="text" id="domain-target" placeholder="example.com or 8.8.8.8" required />
      <button type="submit" class="btn btn-primary">Run checks</button>
    </div>
  </form>
  <div id="domain-results" class="report-layout">
    ${emptyStateHtml({
      icon: '🛡',
      title: 'No report yet',
      message: 'Enter a domain or IP to generate a professional-style check report.'
    })}
  </div>
`;

export const bindDomainChecks = (root) => {
  const form = root.querySelector('#domain-check-form');
  const results = root.querySelector('#domain-results');
  const input = root.querySelector('#domain-target');

  root.querySelectorAll('[data-sample]').forEach((btn) => {
    btn.addEventListener('click', () => {
      input.value = btn.dataset.sample;
    });
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const target = input.value.trim();
    results.innerHTML = loadingHtml('Running domain & IP checks…');
    try {
      const data = await runDomainCheck(target);
      const overall =
        data.summary.fail > 0 ? 'fail' : data.summary.warn > 0 ? 'warn' : 'pass';
      saveHistoryEntry({
        testType: 'domain',
        target: data.target,
        summary: data.summary
      });
      results.innerHTML = resultCardHtml({
        title: data.target,
        subtitle: `Source: ${data.source}`,
        status: overall,
        checks: data.checks
      });
    } catch (err) {
      results.innerHTML = `<div class="alert alert-error">${err.message}</div>`;
    }
  });
};

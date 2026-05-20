import { getTodayStats, getHistory } from '../storage.js';
import { PAGES, navigateTo } from '../components/nav.js';

export const renderDashboard = (apiHealth) => {
  const stats = getTodayStats();
  const history = getHistory().slice(0, 5);
  const twilio = apiHealth?.services?.twilio;

  return `
    <section class="page-header">
      <div>
        <p class="page-eyebrow">Overview</p>
        <h1>Dashboard</h1>
        <p class="page-desc">Daily automation for site, phone, and domain quality checks.</p>
      </div>
      <div class="page-actions">
        <button type="button" class="btn btn-primary" data-goto="site-tests">Run site test</button>
        <button type="button" class="btn btn-secondary" data-goto="spreadsheet">Upload spreadsheet</button>
      </div>
    </section>

    <div class="stats-grid">
      <article class="stat-card">
        <span class="stat-label">Sites tested today</span>
        <span class="stat-value">${stats.sites}</span>
      </article>
      <article class="stat-card">
        <span class="stat-label">Phone tests run</span>
        <span class="stat-value">${stats.phones}</span>
      </article>
      <article class="stat-card">
        <span class="stat-label">Domains checked</span>
        <span class="stat-value">${stats.domains}</span>
      </article>
      <article class="stat-card stat-card-danger">
        <span class="stat-label">Failed checks</span>
        <span class="stat-value">${stats.failed}</span>
      </article>
    </div>

    <div class="dashboard-panels">
      <article class="panel-card">
        <h2>Quick actions</h2>
        <div class="quick-actions">
          ${PAGES.filter((p) => !['dashboard', 'settings', 'reports'].includes(p.id))
            .map(
              (p) => `
            <button type="button" class="quick-action" data-goto="${p.id}">
              <span>${p.icon}</span>
              <span>${p.label}</span>
            </button>`
            )
            .join('')}
        </div>
      </article>
      <article class="panel-card">
        <h2>API status</h2>
        <ul class="status-list">
          <li>Local API: <strong>${apiHealth ? 'Connected' : 'Not running — mock mode'}</strong></li>
          <li>Twilio: <strong>${twilio?.twilioConfigured ? 'Configured' : 'Mock mode'}</strong></li>
          <li>MXToolbox: <strong>${apiHealth?.services?.mxtoolbox ? 'Configured' : 'DNS fallback'}</strong></li>
        </ul>
        <p class="hint">Start <code>npm run dev:api</code> for live checks. Keys stay in <code>.env</code> only.</p>
      </article>
    </div>

    <article class="panel-card">
      <h2>Recent activity</h2>
      ${
        history.length
          ? `<table class="data-table">
        <thead><tr><th>Date</th><th>Type</th><th>Target</th><th>Pass</th><th>Warn</th><th>Fail</th></tr></thead>
        <tbody>
          ${history
            .map(
              (h) => `<tr>
            <td>${new Date(h.date).toLocaleString()}</td>
            <td>${h.testType}</td>
            <td>${h.target || '—'}</td>
            <td>${h.summary?.pass ?? '—'}</td>
            <td>${h.summary?.warn ?? '—'}</td>
            <td>${h.summary?.fail ?? '—'}</td>
          </tr>`
            )
            .join('')}
        </tbody>
      </table>`
          : '<p class="muted">No runs yet. Start a check from Site Tests or Domain & IP.</p>'
      }
    </article>
  `;
};

export const bindDashboard = (root) => {
  root.querySelectorAll('[data-goto]').forEach((btn) => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.goto));
  });
};

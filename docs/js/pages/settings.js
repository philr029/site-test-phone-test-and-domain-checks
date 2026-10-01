import { API_BASE, setApiBase, STORAGE_KEYS } from '../config.js';
import {
  getSettings,
  saveSettings,
  clearHistory,
  clearStats,
  clearAllLocalData,
  getHistory,
  exportHistoryJson
} from '../storage.js';

const API_PRESETS = [
  { label: 'Default (3847)', url: 'http://127.0.0.1:3847' },
  { label: 'Alt port (3848)', url: 'http://127.0.0.1:3848' },
  { label: 'Mock mode', url: '' }
];

const CLI_COMMANDS = [
  { label: 'Full dev stack', cmd: 'npm run dev' },
  { label: 'API only', cmd: 'npm run dev:api' },
  { label: 'Site E2E', cmd: 'npm run test:e2e' },
  { label: 'Form popup', cmd: 'npm run test:form-popup' },
  { label: 'Phone tests', cmd: 'npm run test:phone' },
  { label: 'Domain checks', cmd: 'npm run test:domain' }
];

const ENV_VARS = [
  { name: 'TWILIO_ACCOUNT_SID', purpose: 'Phone tests', required: 'For live calls' },
  { name: 'TWILIO_AUTH_TOKEN', purpose: 'Phone tests', required: 'For live calls' },
  { name: 'TWILIO_FROM_NUMBER', purpose: 'Phone tests', required: 'For live calls' },
  { name: 'MXTOOLBOX_API_KEY', purpose: 'Domain reputation', required: 'Optional — DNS fallback' },
  { name: 'ABUSEIPDB_API_KEY', purpose: 'IP reputation', required: 'Optional — placeholder' },
  { name: 'VIRUSTOTAL_API_KEY', purpose: 'Malware scan', required: 'Optional — placeholder' },
  { name: 'DASHBOARD_API_PORT', purpose: 'API port', required: 'Default 3847' },
  { name: 'NOTIFIER_WEBHOOK_URL', purpose: 'CI alerts', required: 'Optional' }
];

const isGitHubPages = () =>
  typeof window !== 'undefined' && window.location.hostname.endsWith('github.io');

const getStoredThemeChoice = () => {
  const stored = localStorage.getItem(STORAGE_KEYS.theme);
  if (stored === 'system' || stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const serviceStatus = (configured, labelOn, labelOff) =>
  configured
    ? { cls: 'ok', text: labelOn, icon: '✓' }
    : { cls: 'warn', text: labelOff, icon: '○' };

const renderServiceCard = (icon, name, desc, status) => `
  <article class="settings-service-card">
    <div class="settings-service-icon">${icon}</div>
    <div class="settings-service-body">
      <h3>${name}</h3>
      <p>${desc}</p>
      <span class="status-pill ${status.cls}">${status.icon} ${status.text}</span>
    </div>
  </article>`;

export const renderSettings = (apiHealth) => {
  const onPages = isGitHubPages();
  const twilio = apiHealth?.services?.twilio;
  const configuredCount = [
    apiHealth,
    twilio?.twilioConfigured,
    apiHealth?.services?.mxtoolbox,
    apiHealth?.services?.abuseIpdb,
    apiHealth?.services?.virusTotal
  ].filter(Boolean).length;

  const currentTheme = getStoredThemeChoice();
  const historyCount = getHistory().length;
  const apiDisplay = API_BASE || '(mock mode — no URL)';

  return `
    <section class="page-header">
      <div>
        <p class="page-eyebrow">Configuration</p>
        <h1>Settings</h1>
        <p class="page-desc">Connect the local API, tune appearance, and review service integrations. Secrets stay in <code>.env</code> on the server — never in the browser.</p>
      </div>
      <div class="page-actions">
        <button type="button" class="btn btn-secondary" id="settings-refresh-health">Refresh status</button>
      </div>
    </section>

    <div class="settings-env-banner ${onPages ? 'settings-env-remote' : 'settings-env-local'}">
      <div class="settings-env-icon">${onPages ? '☁️' : '💻'}</div>
      <div>
        <strong>${onPages ? 'GitHub Pages — mock mode' : 'Local development'}</strong>
        <p>${onPages
          ? 'The dashboard runs in the browser without a backend. DNS fallback and mock data are used automatically.'
          : 'Run <code>npm run dev</code> for the UI and API together, or <code>npm run dev:api</code> for API-only.'}</p>
      </div>
    </div>

    <div class="settings-summary-row">
      <article class="settings-summary-card">
        <span class="stat-label">API</span>
        <span class="settings-summary-value ${apiHealth ? 'text-success' : 'text-warning'}">${apiHealth ? 'Connected' : 'Offline'}</span>
      </article>
      <article class="settings-summary-card">
        <span class="stat-label">Services</span>
        <span class="settings-summary-value">${configuredCount}/5</span>
      </article>
      <article class="settings-summary-card" id="settings-theme-summary">
        <span class="stat-label">Theme</span>
        <span class="settings-summary-value">${currentTheme}</span>
      </article>
      <article class="settings-summary-card">
        <span class="stat-label">History</span>
        <span class="settings-summary-value">${historyCount} runs</span>
      </article>
    </div>

    <div class="settings-grid">
      <div class="settings-column">
        <article class="panel-card settings-panel">
          <h2>API connection</h2>
          <form id="settings-form" class="check-form">
            <label for="api-base">Local API base URL</label>
            <div class="input-row">
              <input type="url" id="api-base" value="${API_BASE}" placeholder="http://127.0.0.1:3847" aria-describedby="api-base-hint" />
            </div>
            <div class="settings-presets">
              ${API_PRESETS.map(
                (p) => `
                <button type="button" class="chip api-preset" data-url="${p.url}">${p.label}</button>
              `
              ).join('')}
            </div>
            <p class="hint" id="api-base-hint">Current: <code>${apiDisplay}</code>. Leave empty on GitHub Pages for mock mode.</p>
            <div class="settings-form-actions">
              <button type="button" class="btn btn-secondary" id="api-test-btn">Test connection</button>
              <button type="submit" class="btn btn-primary">Save &amp; reload</button>
            </div>
            <div id="api-test-result" class="settings-test-result" hidden></div>
          </form>
        </article>

        <article class="panel-card settings-panel">
          <h2>Appearance</h2>
          <p class="hint settings-panel-intro">Choose how the dashboard looks. System follows your OS preference.</p>
          <div class="toggle-group settings-theme-group" id="theme-picker">
            <button type="button" class="toggle-btn ${currentTheme === 'light' ? 'active' : ''}" data-theme="light">☀️ Light</button>
            <button type="button" class="toggle-btn ${currentTheme === 'dark' ? 'active' : ''}" data-theme="dark">🌙 Dark</button>
            <button type="button" class="toggle-btn ${currentTheme === 'system' ? 'active' : ''}" data-theme="system">⚙️ System</button>
          </div>
        </article>

        <article class="panel-card settings-panel">
          <h2>Data management</h2>
          <p class="hint settings-panel-intro">${historyCount} test runs stored locally in your browser (history + daily stats).</p>
          <div class="settings-form-actions">
            <button type="button" class="btn btn-secondary" id="export-history-btn" ${historyCount ? '' : 'disabled'}>Export history (JSON)</button>
            <button type="button" class="btn btn-secondary" id="clear-stats-btn">Clear stats</button>
            <button type="button" class="btn btn-secondary btn-danger" id="clear-history-btn">Clear history</button>
            <button type="button" class="btn btn-secondary btn-danger" id="reset-local-btn">Reset all local data</button>
          </div>
        </article>
      </div>

      <div class="settings-column">
        <article class="panel-card settings-panel">
          <h2>Service integrations</h2>
          <div class="settings-services-grid">
            ${renderServiceCard(
              '📞',
              'Twilio',
              'Outbound phone line verification',
              serviceStatus(twilio?.twilioConfigured, 'Configured', 'Mock mode')
            )}
            ${renderServiceCard(
              '🛡',
              'MXToolbox',
              'Domain &amp; email reputation',
              serviceStatus(apiHealth?.services?.mxtoolbox, 'API key set', 'DNS fallback')
            )}
            ${renderServiceCard(
              '🔍',
              'AbuseIPDB',
              'IP abuse scoring',
              serviceStatus(apiHealth?.services?.abuseIpdb, 'API key set', 'Placeholder')
            )}
            ${renderServiceCard(
              '🦠',
              'VirusTotal',
              'Malware &amp; URL scanning',
              serviceStatus(apiHealth?.services?.virusTotal, 'API key set', 'Placeholder')
            )}
          </div>
          ${twilio?.missingKeys?.length
            ? `<p class="hint settings-missing-keys">Missing Twilio keys: ${twilio.missingKeys.map((k) => `<code>${k}</code>`).join(', ')}</p>`
            : ''}
        </article>

        <article class="panel-card settings-panel">
          <h2>CLI automation</h2>
          <p class="hint settings-panel-intro">Playwright and Twilio scripts in <code>src/</code> are the source of truth for CI.</p>
          <ul class="settings-cli-list">
            ${CLI_COMMANDS.map(
              (c) => `
              <li>
                <div class="settings-cli-cmd">
                  <span class="settings-cli-label">${c.label}</span>
                  <code>${c.cmd}</code>
                </div>
                <button type="button" class="btn btn-secondary btn-sm cli-copy" data-cmd="${c.cmd}" aria-label="Copy ${c.cmd}">Copy</button>
              </li>
            `
            ).join('')}
          </ul>
        </article>
      </div>
    </div>

    <article class="panel-card settings-panel">
      <h2>Environment variables</h2>
      <p class="hint settings-panel-intro">Copy <code>.env.example</code> to <code>.env</code> and fill in only what you need. Never commit real keys.</p>
      <div class="table-scroll">
        <table class="env-table">
          <thead>
            <tr><th>Variable</th><th>Purpose</th><th>Notes</th><th></th></tr>
          </thead>
          <tbody>
            ${ENV_VARS.map(
              (v) => `
              <tr>
                <td><code>${v.name}</code></td>
                <td>${v.purpose}</td>
                <td>${v.required}</td>
                <td class="settings-env-copy-cell">
                  <button type="button" class="btn btn-secondary btn-sm env-copy" data-name="${v.name}" aria-label="Copy ${v.name}">Copy</button>
                </td>
              </tr>
            `
            ).join('')}
          </tbody>
        </table>
      </div>
    </article>
  `;
};

export const applyThemeChoice = (choice) => {
  let resolved = choice;
  if (choice === 'system') {
    resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    localStorage.setItem(STORAGE_KEYS.theme, 'system');
  } else {
    localStorage.setItem(STORAGE_KEYS.theme, choice);
    resolved = choice;
  }
  document.documentElement.setAttribute('data-theme', resolved);
  const toggle = document.getElementById('theme-toggle');
  if (toggle) toggle.textContent = resolved === 'dark' ? '☀️' : '🌙';
};

const copyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

const flashButton = (btn, ok) => {
  const prev = btn.textContent;
  btn.textContent = ok ? 'Copied!' : 'Failed';
  setTimeout(() => {
    btn.textContent = prev;
  }, 1500);
};

export const bindSettings = (root) => {
  root.querySelector('#settings-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    setApiBase(root.querySelector('#api-base').value.trim());
  });

  root.querySelectorAll('.api-preset').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = root.querySelector('#api-base');
      if (input) input.value = btn.dataset.url;
    });
  });

  root.querySelector('#api-test-btn')?.addEventListener('click', async () => {
    const resultEl = root.querySelector('#api-test-result');
    const url = root.querySelector('#api-base')?.value.trim();
    if (!resultEl) return;

    resultEl.hidden = false;
    resultEl.className = 'settings-test-result settings-test-loading';
    resultEl.textContent = 'Testing connection…';

    if (!url) {
      resultEl.className = 'settings-test-result settings-test-warn';
      resultEl.textContent = 'No API URL — mock mode will be used (expected on GitHub Pages).';
      return;
    }

    try {
      const res = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(4000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const services = data.services || {};
      const twilioOk = services.twilio?.twilioConfigured;
      resultEl.className = 'settings-test-result settings-test-ok';
      resultEl.textContent = `Connected — Twilio: ${twilioOk ? 'ready' : 'mock'}, MXToolbox: ${services.mxtoolbox ? 'yes' : 'fallback'}`;
    } catch (err) {
      resultEl.className = 'settings-test-result settings-test-fail';
      resultEl.textContent = `Failed — ${err.message}. Is npm run dev:api running?`;
    }
  });

  root.querySelector('#settings-refresh-health')?.addEventListener('click', () => {
    location.reload();
  });

  root.querySelector('#theme-picker')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-theme]');
    if (!btn) return;
    root.querySelectorAll('#theme-picker .toggle-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    applyThemeChoice(btn.dataset.theme);
    const settings = getSettings();
    saveSettings({ ...settings, theme: btn.dataset.theme });
    const summaryTheme = root.querySelector('#settings-theme-summary .settings-summary-value');
    if (summaryTheme) summaryTheme.textContent = btn.dataset.theme;
  });

  root.querySelectorAll('.cli-copy, .env-copy').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const text = btn.dataset.cmd || btn.dataset.name;
      const ok = await copyToClipboard(text);
      flashButton(btn, ok);
    });
  });

  root.querySelector('#export-history-btn')?.addEventListener('click', () => {
    const json = exportHistoryJson();
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `qa-dashboard-history-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  root.querySelector('#clear-stats-btn')?.addEventListener('click', () => {
    if (!confirm('Clear daily stats counters? History will be kept.')) return;
    clearStats();
    location.reload();
  });

  root.querySelector('#clear-history-btn')?.addEventListener('click', () => {
    if (!confirm('Clear all test history from this browser?')) return;
    clearHistory();
    location.reload();
  });

  root.querySelector('#reset-local-btn')?.addEventListener('click', () => {
    if (!confirm('Reset all dashboard data in this browser (history, stats, saved settings)? API URL and theme will be kept.')) return;
    clearAllLocalData();
    location.reload();
  });
};

import { API_BASE, setApiBase, STORAGE_KEYS } from '../config.js';
import { getSettings, saveSettings, getHistory, clearHistory } from '../storage.js';
import { probeApiHealth } from '../services/api-client.js';

const esc = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');

const isGitHubPages = () =>
  typeof window !== 'undefined' && window.location.hostname.endsWith('github.io');

const countConfiguredServices = (apiHealth) => {
  if (!apiHealth?.services) return 0;
  const { twilio, mxtoolbox, abuseIpdb, virusTotal } = apiHealth.services;
  let count = 1;
  if (twilio?.twilioConfigured) count += 1;
  if (mxtoolbox) count += 1;
  if (abuseIpdb) count += 1;
  if (virusTotal) count += 1;
  return count;
};

const SERVICE_DEFS = [
  {
    id: 'api',
    label: 'Local API',
    icon: '🔌',
    tone: 'blue',
    getStatus: (h) => (h ? 'online' : 'offline'),
    getLabel: (h) => (h ? 'Connected' : 'Offline'),
    getDetail: (h) =>
      h ? 'Live checks enabled via local server' : 'Browser mock / DNS fallback mode'
  },
  {
    id: 'twilio',
    label: 'Twilio',
    icon: '📞',
    tone: 'purple',
    getStatus: (h) => (h?.services?.twilio?.twilioConfigured ? 'online' : 'mock'),
    getLabel: (h) => (h?.services?.twilio?.twilioConfigured ? 'Configured' : 'Mock'),
    getDetail: (h) => {
      const missing = h?.services?.twilio?.missingKeys;
      if (h?.services?.twilio?.twilioConfigured) return 'Outbound phone tests ready';
      if (missing?.length) return `Missing: ${missing.join(', ')}`;
      return 'Set TWILIO_* in .env for live calls';
    }
  },
  {
    id: 'mxtoolbox',
    label: 'MXToolbox',
    icon: '🛡',
    tone: 'teal',
    getStatus: (h) => (h?.services?.mxtoolbox ? 'online' : 'fallback'),
    getLabel: (h) => (h?.services?.mxtoolbox ? 'Configured' : 'DNS fallback'),
    getDetail: (h) =>
      h?.services?.mxtoolbox
        ? 'Full blacklist & reputation API'
        : 'Basic DNS checks run in the browser'
  },
  {
    id: 'abuseIpdb',
    label: 'AbuseIPDB',
    icon: '🚫',
    tone: 'orange',
    getStatus: (h) => (h?.services?.abuseIpdb ? 'online' : 'placeholder'),
    getLabel: (h) => (h?.services?.abuseIpdb ? 'Configured' : 'Placeholder'),
    getDetail: () => 'IP reputation scoring when ABUSEIPDB_API_KEY is set'
  },
  {
    id: 'virusTotal',
    label: 'VirusTotal',
    icon: '🔍',
    tone: 'green',
    getStatus: (h) => (h?.services?.virusTotal ? 'online' : 'placeholder'),
    getLabel: (h) => (h?.services?.virusTotal ? 'Configured' : 'Placeholder'),
    getDetail: () => 'Malware & domain scanning when VIRUSTOTAL_API_KEY is set'
  }
];

const ENV_VARS = [
  { name: 'DASHBOARD_API_PORT', purpose: 'Local API port (default 3847)', required: false },
  { name: 'TWILIO_ACCOUNT_SID', purpose: 'Twilio account for phone tests', required: true },
  { name: 'TWILIO_AUTH_TOKEN', purpose: 'Twilio auth token', required: true },
  { name: 'TWILIO_FROM_NUMBER', purpose: 'Outbound caller ID (E.164)', required: true },
  { name: 'MXTOOLBOX_API_KEY', purpose: 'Enhanced domain & blacklist checks', required: false },
  { name: 'ABUSEIPDB_API_KEY', purpose: 'IP reputation lookups', required: false },
  { name: 'VIRUSTOTAL_API_KEY', purpose: 'Malware & domain scanning', required: false }
];

const CLI_COMMANDS = [
  { cmd: 'npm run dev', desc: 'Start API + dashboard (recommended)' },
  { cmd: 'npm run dev:api', desc: 'Local API only (port 3847)' },
  { cmd: 'npm run test:e2e', desc: 'Full Playwright + phone + domain suite' },
  { cmd: 'npm run test:form-popup', desc: 'Website form & popup checks' },
  { cmd: 'npm run test:phone', desc: 'Twilio outbound phone tests' },
  { cmd: 'npm run test:domain', desc: 'Domain & email health checks' }
];

const serviceCardHtml = (def, apiHealth) => {
  const status = def.getStatus(apiHealth);
  const pillClass =
    status === 'online' ? 'ok' : status === 'offline' ? 'warn' : 'info';
  return `
    <article class="service-card service-${status}">
      <div class="service-card-top">
        <span class="service-icon status-icon ${def.tone}" aria-hidden="true">${def.icon}</span>
        <span class="status-pill ${pillClass}">${def.getLabel(apiHealth)}</span>
      </div>
      <h3 class="service-name">${def.label}</h3>
      <p class="service-detail">${def.getDetail(apiHealth)}</p>
    </article>`;
};

export const renderSettings = (apiHealth) => {
  const settings = getSettings();
  const historyCount = getHistory().length;
  const onPages = isGitHubPages();
  const configuredCount = countConfiguredServices(apiHealth);
  const storedTheme = localStorage.getItem(STORAGE_KEYS.theme);
  const themeLabel = storedTheme || 'system';

  return `
    <section class="page-header">
      <div>
        <p class="page-eyebrow">Configuration</p>
        <h1>Settings</h1>
        <p class="page-desc">Connect the local API, review service health, and manage dashboard preferences. Secrets stay in <code>.env</code> on the server — never in the browser.</p>
      </div>
      <div class="page-actions">
        <span class="deploy-badge ${onPages ? 'deploy-remote' : 'deploy-local'}">
          ${onPages ? '☁ GitHub Pages' : '💻 Local dev'}
        </span>
        <button type="button" class="btn btn-secondary btn-sm" id="settings-refresh">Refresh status</button>
      </div>
    </section>

    <div class="settings-stats">
      <article class="stat-card">
        <span class="stat-label">Deployment</span>
        <span class="stat-value stat-value-sm">${onPages ? 'Static' : 'Local'}</span>
      </article>
      <article class="stat-card">
        <span class="stat-label">API mode</span>
        <span class="stat-value stat-value-sm">${apiHealth ? 'Live' : 'Mock'}</span>
      </article>
      <article class="stat-card">
        <span class="stat-label">Services ready</span>
        <span class="stat-value stat-value-sm">${configuredCount}/5</span>
      </article>
      <article class="stat-card">
        <span class="stat-label">History entries</span>
        <span class="stat-value stat-value-sm">${historyCount}</span>
      </article>
    </div>

    ${
      onPages
        ? `<div class="settings-banner settings-banner-info">
            <strong>Running on GitHub Pages.</strong> The local API cannot be reached from static hosting.
            Clone the repo and run <code>npm run dev</code> for live Twilio, Playwright, and API-backed checks.
          </div>`
        : `<div class="settings-banner settings-banner-success">
            <strong>Local environment detected.</strong> Start the API with <code>npm run dev:api</code> then save the URL below to enable live checks.
          </div>`
    }

    <div class="settings-grid">
      <article class="panel-card settings-panel">
        <div class="panel-header">
          <h2>API connection</h2>
          <span class="muted">Port 3847 default</span>
        </div>
        <form id="settings-form" class="check-form settings-form">
          <label for="api-base">Local API base URL</label>
          <div class="input-row">
            <input type="url" id="api-base" value="${esc(API_BASE)}" placeholder="http://127.0.0.1:3847" />
            <button type="button" class="btn btn-secondary" id="test-api-btn">Test</button>
          </div>
          <div class="api-presets">
            <span class="muted">Quick fill:</span>
            <button type="button" class="chip" data-preset="http://127.0.0.1:3847">127.0.0.1:3847</button>
            <button type="button" class="chip" data-preset="http://localhost:3847">localhost:3847</button>
            <button type="button" class="chip" data-preset="">Mock mode (empty)</button>
          </div>
          <div id="api-test-result" class="api-test-result" hidden></div>
          <p class="hint">Leave empty on GitHub Pages for automatic mock mode. Changes reload the dashboard.</p>
          <div class="settings-form-actions">
            <button type="submit" class="btn btn-primary">Save &amp; reload</button>
            <button type="button" class="btn btn-secondary" id="reset-api-btn">Reset to default</button>
          </div>
        </form>
      </article>

      <article class="panel-card settings-panel">
        <div class="panel-header">
          <h2>Preferences</h2>
        </div>
        <form id="preferences-form" class="check-form settings-form">
          <label for="theme-select">Theme</label>
          <select id="theme-select" name="theme">
            <option value="system" ${!storedTheme ? 'selected' : ''}>System</option>
            <option value="light" ${storedTheme === 'light' ? 'selected' : ''}>Light</option>
            <option value="dark" ${storedTheme === 'dark' ? 'selected' : ''}>Dark</option>
          </select>

          <label class="settings-checkbox">
            <input type="checkbox" id="pref-confirm-clear" ${settings.confirmBeforeClear !== false ? 'checked' : ''} />
            <span>Confirm before clearing report history</span>
          </label>

          <label class="settings-checkbox">
            <input type="checkbox" id="pref-show-hints" ${settings.showSetupHints !== false ? 'checked' : ''} />
            <span>Show setup tips on dashboard</span>
          </label>

          <button type="submit" class="btn btn-primary">Save preferences</button>
          <p id="prefs-saved" class="settings-saved" hidden>Preferences saved.</p>
        </form>
      </article>
    </div>

    <article class="panel-card">
      <div class="panel-header">
        <h2>Service status</h2>
        <span class="muted">From <code>/api/health</code></span>
      </div>
      <div class="service-grid">
        ${SERVICE_DEFS.map((def) => serviceCardHtml(def, apiHealth)).join('')}
      </div>
    </article>

    <div class="settings-grid">
      <article class="panel-card settings-panel">
        <h2>Quick setup</h2>
        <ol class="setup-steps">
          <li>
            <strong>Clone &amp; install</strong>
            <p><code>git clone … && npm install</code></p>
          </li>
          <li>
            <strong>Copy environment file</strong>
            <p><code>cp .env.example .env</code> — add Twilio and API keys</p>
          </li>
          <li>
            <strong>Start everything</strong>
            <p><code>npm run dev</code> then open <code>http://127.0.0.1:8080</code></p>
          </li>
          <li>
            <strong>Save API URL</strong>
            <p>Set <code>http://127.0.0.1:3847</code> above and run your first check</p>
          </li>
        </ol>
      </article>

      <article class="panel-card settings-panel">
        <h2>Data &amp; storage</h2>
        <p class="hint">Report history and stats are stored in your browser only — nothing is sent to a server.</p>
        <dl class="storage-stats">
          <div><dt>History entries</dt><dd>${historyCount}</dd></div>
          <div><dt>API URL stored</dt><dd>${API_BASE ? esc(API_BASE) : '— (mock mode)'}</dd></div>
          <div><dt>Theme</dt><dd>${themeLabel}</dd></div>
        </dl>
        <div class="settings-form-actions">
          <button type="button" class="btn btn-secondary btn-sm" id="settings-clear-history">Clear history</button>
          <a class="btn btn-secondary btn-sm" href="#reports">View reports</a>
        </div>
      </article>
    </div>

    <details class="panel-card settings-accordion">
      <summary class="settings-accordion-trigger">
        <span>Environment variables reference</span>
        <span class="accordion-chevron" aria-hidden="true"></span>
      </summary>
      <div class="settings-accordion-body">
        <p class="hint">Add these to <code>.env</code> in the project root. Never commit real keys.</p>
        <div class="table-scroll">
          <table class="env-table">
            <thead>
              <tr><th>Variable</th><th>Purpose</th><th>Required</th></tr>
            </thead>
            <tbody>
              ${ENV_VARS.map(
                (v) => `<tr>
                  <td><code>${v.name}</code></td>
                  <td>${v.purpose}</td>
                  <td>${v.required ? '<span class="status-badge warn">For live</span>' : '<span class="status-badge info">Optional</span>'}</td>
                </tr>`
              ).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </details>

    <article class="panel-card">
      <div class="panel-header">
        <h2>CLI automation</h2>
        <span class="muted">Source of truth for CI</span>
      </div>
      <p class="hint">Playwright and Twilio scripts in <code>src/</code> power scheduled runs. The dashboard mirrors these for interactive testing.</p>
      <div class="cli-list">
        ${CLI_COMMANDS.map(
          (c) => `
          <div class="cli-row">
            <div class="cli-row-main">
              <code class="cli-cmd">${c.cmd}</code>
              <span class="cli-desc">${c.desc}</span>
            </div>
            <button type="button" class="btn btn-secondary btn-sm cli-copy" data-copy="${esc(c.cmd)}">Copy</button>
          </div>`
        ).join('')}
      </div>
    </article>
  `;
};

const applyTheme = (value) => {
  const resolved =
    value === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : value;
  document.documentElement.setAttribute('data-theme', resolved);
  const toggle = document.getElementById('theme-toggle');
  if (toggle) toggle.textContent = resolved === 'dark' ? '☀️' : '🌙';
};

export const bindSettings = (root) => {
  const apiInput = root.querySelector('#api-base');
  const testResult = root.querySelector('#api-test-result');

  root.querySelector('#settings-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    setApiBase(apiInput.value.trim());
  });

  root.querySelector('#reset-api-btn')?.addEventListener('click', () => {
    localStorage.removeItem('qa-api-base');
    window.location.reload();
  });

  root.querySelector('#test-api-btn')?.addEventListener('click', async () => {
    const url = apiInput.value.trim();
    testResult.hidden = false;
    testResult.className = 'api-test-result api-test-loading';
    testResult.textContent = 'Testing connection…';

    const health = await probeApiHealth(url);
    if (!url) {
      testResult.className = 'api-test-result api-test-info';
      testResult.textContent = 'Mock mode — no API URL set. Browser fallbacks will be used.';
      return;
    }
    if (health?.ok) {
      const svc = health.services || {};
      const parts = [
        svc.twilio?.twilioConfigured ? 'Twilio' : null,
        svc.mxtoolbox ? 'MXToolbox' : null,
        svc.abuseIpdb ? 'AbuseIPDB' : null,
        svc.virusTotal ? 'VirusTotal' : null
      ].filter(Boolean);
      testResult.className = 'api-test-result api-test-success';
      testResult.textContent = `Connected — ${parts.length ? parts.join(', ') + ' configured' : 'API online, optional services not configured'}`;
    } else {
      testResult.className = 'api-test-result api-test-error';
      testResult.textContent =
        'Could not reach API. Run npm run dev:api and check the URL and port.';
    }
  });

  root.querySelectorAll('[data-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      apiInput.value = btn.dataset.preset;
      apiInput.focus();
    });
  });

  root.querySelector('#preferences-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const theme = root.querySelector('#theme-select').value;
    const confirmBeforeClear = root.querySelector('#pref-confirm-clear').checked;
    const showSetupHints = root.querySelector('#pref-show-hints').checked;

    if (theme === 'system') {
      localStorage.removeItem(STORAGE_KEYS.theme);
    } else {
      localStorage.setItem(STORAGE_KEYS.theme, theme);
    }
    saveSettings({ confirmBeforeClear, showSetupHints });
    applyTheme(theme);

    const saved = root.querySelector('#prefs-saved');
    if (saved) {
      saved.hidden = false;
      setTimeout(() => {
        saved.hidden = true;
      }, 2500);
    }
  });

  root.querySelector('#settings-refresh')?.addEventListener('click', () => {
    window.location.reload();
  });

  root.querySelector('#settings-clear-history')?.addEventListener('click', () => {
    const settings = getSettings();
    const needsConfirm = settings.confirmBeforeClear !== false;
    if (!needsConfirm || confirm('Clear all report history from this browser?')) {
      clearHistory();
      window.location.reload();
    }
  });

  root.querySelectorAll('.cli-copy').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const text = btn.dataset.copy;
      try {
        await navigator.clipboard.writeText(text);
        const prev = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => {
          btn.textContent = prev;
        }, 1500);
      } catch {
        btn.textContent = 'Failed';
      }
    });
  });
};

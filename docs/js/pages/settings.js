import { API_BASE, setApiBase } from '../config.js';
import {
  getSettings,
  saveSettings,
  getStorageSummary,
  clearHistory,
  clearStats,
  clearAllData
} from '../storage.js';
import { checkApiHealth } from '../services/api-client.js';

const isGitHubPages =
  typeof window !== 'undefined' && window.location.hostname.endsWith('github.io');

const API_PRESETS = [
  { label: 'Default (3847)', url: 'http://127.0.0.1:3847' },
  { label: 'Alt port (3848)', url: 'http://127.0.0.1:3848' },
  { label: 'Mock mode', url: '' }
];

const SERVICES = [
  {
    id: 'api',
    name: 'Local API',
    icon: '🔌',
    iconClass: 'blue',
    description: 'Runs Playwright, Twilio, and reputation checks server-side.',
    configured: (h) => Boolean(h),
    statusLabel: (h) => (h ? 'Connected' : 'Offline'),
    statusClass: (h) => (h ? 'ok' : 'warn'),
    detail: (h) =>
      h ? 'Live checks enabled via local server.' : 'Using browser mock / DNS fallback.'
  },
  {
    id: 'twilio',
    name: 'Twilio',
    icon: '📞',
    iconClass: 'green',
    description: 'Outbound phone line verification and call status polling.',
    configured: (h) => Boolean(h?.services?.twilio?.twilioConfigured),
    statusLabel: (h) => (h?.services?.twilio?.twilioConfigured ? 'Configured' : 'Mock'),
    statusClass: (h) => (h?.services?.twilio?.twilioConfigured ? 'ok' : 'warn'),
    detail: () => 'Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER in .env'
  },
  {
    id: 'mxtoolbox',
    name: 'MXToolbox',
    icon: '🛡',
    iconClass: 'purple',
    description: 'Domain blacklist and reputation lookups.',
    configured: (h) => Boolean(h?.services?.mxtoolbox),
    statusLabel: (h) => (h?.services?.mxtoolbox ? 'Configured' : 'DNS fallback'),
    statusClass: (h) => (h?.services?.mxtoolbox ? 'ok' : 'info'),
    detail: () => 'Set MXTOOLBOX_API_KEY in .env for full reputation data.'
  },
  {
    id: 'abuseIpdb',
    name: 'AbuseIPDB',
    icon: '🔍',
    iconClass: 'orange',
    description: 'IP abuse confidence scoring.',
    configured: (h) => Boolean(h?.services?.abuseIpdb),
    statusLabel: (h) => (h?.services?.abuseIpdb ? 'Configured' : 'Placeholder'),
    statusClass: (h) => (h?.services?.abuseIpdb ? 'ok' : 'info'),
    detail: () => 'Set ABUSEIPDB_API_KEY in .env'
  },
  {
    id: 'virusTotal',
    name: 'VirusTotal',
    icon: '🦠',
    iconClass: 'red',
    description: 'Malware and URL/domain scanning.',
    configured: (h) => Boolean(h?.services?.virusTotal),
    statusLabel: (h) => (h?.services?.virusTotal ? 'Configured' : 'Placeholder'),
    statusClass: (h) => (h?.services?.virusTotal ? 'ok' : 'info'),
    detail: () => 'Set VIRUSTOTAL_API_KEY in .env'
  }
];

const CLI_COMMANDS = [
  { label: 'Full E2E suite', cmd: 'npm run test:e2e' },
  { label: 'Form & popup checks', cmd: 'npm run test:form-popup' },
  { label: 'Phone line tests', cmd: 'npm run test:phone' },
  { label: 'Domain health', cmd: 'npm run test:domain' },
  { label: 'Start dev (API + UI)', cmd: 'npm run dev' },
  { label: 'API only', cmd: 'npm run dev:api' }
];

const ENV_VARS = [
  { name: 'TWILIO_ACCOUNT_SID', purpose: 'Phone tests', required: 'Phone checks' },
  { name: 'TWILIO_AUTH_TOKEN', purpose: 'Phone tests', required: 'Phone checks' },
  { name: 'TWILIO_FROM_NUMBER', purpose: 'Outbound caller ID', required: 'Phone checks' },
  { name: 'MXTOOLBOX_API_KEY', purpose: 'Reputation lookups', required: 'Optional' },
  { name: 'ABUSEIPDB_API_KEY', purpose: 'IP abuse scoring', required: 'Optional' },
  { name: 'VIRUSTOTAL_API_KEY', purpose: 'Malware scanning', required: 'Optional' },
  { name: 'NOTIFIER_WEBHOOK_URL', purpose: 'Failure alerts', required: 'Optional' }
];

const serviceCard = (svc, apiHealth) => {
  const configured = svc.configured(apiHealth);
  return `
    <article class="settings-service-card ${configured ? 'is-active' : ''}">
      <div class="settings-service-icon status-icon ${svc.iconClass}">${svc.icon}</div>
      <div class="settings-service-body">
        <div class="settings-service-head">
          <h3>${svc.name}</h3>
          <span class="status-pill ${svc.statusClass(apiHealth)}">${svc.statusLabel(apiHealth)}</span>
        </div>
        <p>${svc.description}</p>
        <p class="hint">${svc.detail(apiHealth)}</p>
      </div>
    </article>`;
};

export const renderSettings = (apiHealth) => {
  const settings = getSettings();
  const storage = getStorageSummary();
  const deploymentMode = isGitHubPages ? 'GitHub Pages' : 'Local';
  const connectedCount = SERVICES.filter((s) => s.configured(apiHealth)).length;

  return `
    <section class="page-header">
      <div>
        <p class="page-eyebrow">Configuration</p>
        <h1>Settings</h1>
        <p class="page-desc">Connect the local API, review integrations, and manage dashboard data. Secrets stay in <code>.env</code> on the server — never in the browser.</p>
      </div>
      <div class="page-actions">
        <button type="button" class="btn btn-secondary btn-sm" id="settings-refresh-health">Refresh status</button>
      </div>
    </section>

    <div class="settings-overview">
      <article class="settings-overview-card ${apiHealth ? 'is-online' : 'is-offline'}">
        <span class="settings-overview-label">API connection</span>
        <span class="settings-overview-value">${apiHealth ? 'Connected' : 'Mock mode'}</span>
        <span class="settings-overview-meta">${API_BASE || 'No API URL configured'}</span>
      </article>
      <article class="settings-overview-card">
        <span class="settings-overview-label">Deployment</span>
        <span class="settings-overview-value">${deploymentMode}</span>
        <span class="settings-overview-meta">${isGitHubPages ? 'Static hosting — API must run locally' : 'Full local development'}</span>
      </article>
      <article class="settings-overview-card">
        <span class="settings-overview-label">Integrations</span>
        <span class="settings-overview-value">${connectedCount} / ${SERVICES.length}</span>
        <span class="settings-overview-meta">Active or configured services</span>
      </article>
      <article class="settings-overview-card">
        <span class="settings-overview-label">Stored runs</span>
        <span class="settings-overview-value">${storage.historyCount}</span>
        <span class="settings-overview-meta">${storage.statsDays} day(s) of stats</span>
      </article>
    </div>

    <div class="settings-layout">
      <div class="settings-main">
        <article class="panel-card settings-panel">
          <div class="panel-header">
            <h2>API connection</h2>
            <span class="status-pill ${apiHealth ? 'ok' : 'warn'}" id="api-status-pill">${apiHealth ? 'Online' : 'Offline'}</span>
          </div>
          <form id="settings-form" class="check-form settings-api-form">
            <label for="api-base">Local API base URL</label>
            <div class="input-row settings-input-row">
              <input type="url" id="api-base" value="${API_BASE}" placeholder="http://127.0.0.1:3847" />
              <button type="button" class="btn btn-secondary" id="test-api-btn">Test</button>
            </div>
            <div class="settings-presets" role="group" aria-label="API URL presets">
              ${API_PRESETS.map(
                (p) =>
                  `<button type="button" class="chip settings-preset" data-url="${p.url}">${p.label}</button>`
              ).join('')}
            </div>
            <p class="hint">Run <code>npm run dev</code> or <code>npm run dev:api</code> (default port 3847). On GitHub Pages, leave empty for mock mode.</p>
            <div id="api-test-result" class="settings-test-result" hidden></div>
            <div class="settings-form-actions">
              <button type="submit" class="btn btn-primary">Save &amp; reload</button>
            </div>
          </form>
        </article>

        <article class="panel-card settings-panel">
          <h2>Service integrations</h2>
          <p class="hint settings-section-intro">Status reflects your local API's <code>.env</code> configuration. Missing keys use safe fallbacks — never fake passes.</p>
          <div class="settings-services-grid">
            ${SERVICES.map((s) => serviceCard(s, apiHealth)).join('')}
          </div>
        </article>

        <article class="panel-card settings-panel">
          <h2>Environment variables</h2>
          <p class="hint settings-section-intro">Copy <code>.env.example</code> to <code>.env</code> in the project root. These values are read by the API server only.</p>
          <div class="table-scroll">
            <table class="data-table env-table settings-env-table">
              <thead>
                <tr><th>Variable</th><th>Purpose</th><th>Required</th></tr>
              </thead>
              <tbody>
                ${ENV_VARS.map(
                  (v) => `<tr>
                  <td><code>${v.name}</code></td>
                  <td>${v.purpose}</td>
                  <td><span class="status-pill ${v.required === 'Optional' ? 'info' : 'warn'}">${v.required}</span></td>
                </tr>`
                ).join('')}
              </tbody>
            </table>
          </div>
        </article>
      </div>

      <aside class="settings-aside">
        <article class="panel-card settings-panel">
          <h2>Dashboard preferences</h2>
          <form id="preferences-form" class="settings-preferences">
            <label class="settings-toggle">
              <input type="checkbox" name="confirmClear" ${settings.confirmClear !== false ? 'checked' : ''} />
              <span>Confirm before clearing data</span>
            </label>
            <label class="settings-toggle">
              <input type="checkbox" name="autoRefreshHealth" ${settings.autoRefreshHealth ? 'checked' : ''} />
              <span>Auto-refresh API status on load</span>
            </label>
            <button type="submit" class="btn btn-secondary btn-sm settings-save-prefs">Save preferences</button>
            <p class="settings-save-feedback" id="prefs-feedback" hidden>Saved</p>
          </form>
        </article>

        <article class="panel-card settings-panel">
          <h2>Data management</h2>
          <p class="hint">History and stats are stored in your browser's localStorage.</p>
          <ul class="settings-data-stats">
            <li><strong>${storage.historyCount}</strong> history entries</li>
            <li><strong>${storage.statsDays}</strong> days of daily stats</li>
          </ul>
          <div class="settings-data-actions">
            <button type="button" class="btn btn-secondary btn-sm" id="clear-history-btn">Clear history</button>
            <button type="button" class="btn btn-secondary btn-sm" id="clear-stats-btn">Reset stats</button>
            <button type="button" class="btn btn-secondary btn-sm danger" id="clear-all-btn">Clear all data</button>
          </div>
        </article>

        <article class="panel-card settings-panel">
          <h2>CLI commands</h2>
          <p class="hint">Playwright and Twilio scripts in <code>src/</code> remain the source of truth for CI.</p>
          <ul class="settings-cli-list">
            ${CLI_COMMANDS.map(
              (c) => `
              <li>
                <div class="settings-cli-meta">
                  <span class="settings-cli-label">${c.label}</span>
                  <code class="settings-cli-cmd">${c.cmd}</code>
                </div>
                <button type="button" class="btn btn-secondary btn-sm settings-copy-btn" data-copy="${c.cmd}" title="Copy command">Copy</button>
              </li>`
            ).join('')}
          </ul>
        </article>

        <article class="panel-card settings-panel settings-about">
          <h2>About</h2>
          <dl class="settings-about-list">
            <div><dt>Version</dt><dd>1.1.0</dd></div>
            <div><dt>Dashboard</dt><dd>QA Testing Dashboard</dd></div>
            <div><dt>Repository</dt><dd><a href="https://github.com/philr029/site-test-phone-test-and-domain-checks" target="_blank" rel="noopener">GitHub</a></dd></div>
          </dl>
        </article>
      </aside>
    </div>
  `;
};

const confirmAction = (message) => {
  const settings = getSettings();
  if (settings.confirmClear === false) return true;
  return window.confirm(message);
};

const showFeedback = (el, text, duration = 2000) => {
  if (!el) return;
  el.textContent = text;
  el.hidden = false;
  setTimeout(() => {
    el.hidden = true;
  }, duration);
};

const copyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  }
};

export const bindSettings = (root) => {
  const apiInput = root.querySelector('#api-base');
  const testResult = root.querySelector('#api-test-result');

  root.querySelector('#settings-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    setApiBase(apiInput?.value.trim() ?? '');
  });

  root.querySelectorAll('.settings-preset').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (apiInput) apiInput.value = btn.dataset.url ?? '';
      root.querySelectorAll('.settings-preset').forEach((b) => {
        b.classList.toggle('active', b === btn);
      });
    });
  });

  root.querySelector('#test-api-btn')?.addEventListener('click', async () => {
    const url = apiInput?.value.trim();
    if (!url) {
      testResult.hidden = false;
      testResult.className = 'settings-test-result is-warn';
      testResult.textContent = 'No API URL — mock mode will be used.';
      return;
    }
    testResult.hidden = false;
    testResult.className = 'settings-test-result is-loading';
    testResult.textContent = 'Testing connection…';
    try {
      const res = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.ok) {
        testResult.className = 'settings-test-result is-ok';
        const svcCount = Object.values(data.services || {}).filter(Boolean).length;
        testResult.textContent = `Connected — ${svcCount} service(s) reported. Save to apply.`;
      } else {
        throw new Error('API returned not ok');
      }
    } catch (err) {
      testResult.className = 'settings-test-result is-error';
      testResult.textContent = `Connection failed: ${err.message}. Is npm run dev:api running?`;
    }
  });

  root.querySelector('#settings-refresh-health')?.addEventListener('click', async () => {
    const btn = root.querySelector('#settings-refresh-health');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Refreshing…';
    }
    await checkApiHealth();
    window.location.reload();
  });

  root.querySelector('#preferences-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.target;
    saveSettings({
      ...getSettings(),
      confirmClear: form.confirmClear.checked,
      autoRefreshHealth: form.autoRefreshHealth.checked
    });
    showFeedback(root.querySelector('#prefs-feedback'), 'Preferences saved');
  });

  root.querySelector('#clear-history-btn')?.addEventListener('click', () => {
    if (confirmAction('Clear all test history? This cannot be undone.')) {
      clearHistory();
      window.location.reload();
    }
  });

  root.querySelector('#clear-stats-btn')?.addEventListener('click', () => {
    if (confirmAction('Reset daily stats? History will be kept.')) {
      clearStats();
      window.location.reload();
    }
  });

  root.querySelector('#clear-all-btn')?.addEventListener('click', () => {
    if (confirmAction('Clear all dashboard data (history + stats)? This cannot be undone.')) {
      clearAllData();
      window.location.reload();
    }
  });

  root.querySelectorAll('.settings-copy-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const ok = await copyToClipboard(btn.dataset.copy ?? '');
      const original = btn.textContent;
      btn.textContent = ok ? 'Copied!' : 'Failed';
      setTimeout(() => {
        btn.textContent = original;
      }, 1500);
    });
  });

  const activePreset = API_PRESETS.find((p) => p.url === API_BASE);
  if (activePreset) {
    root.querySelectorAll('.settings-preset').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.url === API_BASE);
    });
  }
};

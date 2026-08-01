import { API_BASE, setApiBase, STORAGE_KEYS } from '../config.js';
import { getHistory, clearHistory } from '../storage.js';
import { checkApiHealth } from '../services/api-client.js';

const probeApiHealth = async (baseUrl) => {
  if (!baseUrl) return null;
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/health`, {
      signal: AbortSignal.timeout(2500)
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.ok ? data : null;
  } catch {
    return null;
  }
};

const isGitHubPages = () =>
  typeof window !== 'undefined' && window.location.hostname.endsWith('github.io');

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const SERVICE_DEFS = [
  {
    id: 'api',
    name: 'Local API',
    icon: '🔌',
    desc: 'Dashboard backend for live checks',
    status: (health) =>
      health
        ? { label: 'Connected', tone: 'ok', detail: 'Live checks enabled' }
        : { label: 'Offline', tone: 'warn', detail: 'Mock / DNS fallback mode' }
  },
  {
    id: 'twilio',
    name: 'Twilio',
    icon: '📞',
    desc: 'Outbound phone line verification',
    status: (health) =>
      health?.services?.twilio?.twilioConfigured
        ? { label: 'Configured', tone: 'ok', detail: 'Real call tests available' }
        : { label: 'Mock', tone: 'info', detail: 'Add credentials to .env' }
  },
  {
    id: 'mxtoolbox',
    name: 'MXToolbox',
    icon: '📧',
    desc: 'Domain & email reputation lookups',
    status: (health) =>
      health?.services?.mxtoolbox
        ? { label: 'Configured', tone: 'ok', detail: 'API reputation checks' }
        : { label: 'DNS fallback', tone: 'warn', detail: 'Basic DNS checks only' }
  },
  {
    id: 'abuseIpdb',
    name: 'AbuseIPDB',
    icon: '🛡',
    desc: 'IP reputation scoring',
    status: (health) =>
      health?.services?.abuseIpdb
        ? { label: 'Configured', tone: 'ok', detail: 'IP reputation enabled' }
        : { label: 'Placeholder', tone: 'info', detail: 'Optional — add API key' }
  },
  {
    id: 'virusTotal',
    name: 'VirusTotal',
    icon: '🔍',
    desc: 'Malware & URL scanning',
    status: (health) =>
      health?.services?.virusTotal
        ? { label: 'Configured', tone: 'ok', detail: 'Threat scanning enabled' }
        : { label: 'Placeholder', tone: 'info', detail: 'Optional — add API key' }
  }
];

const CLI_COMMANDS = [
  { label: 'Full E2E suite', cmd: 'npm run test:e2e' },
  { label: 'Form & popup checks', cmd: 'npm run test:form-popup' },
  { label: 'Phone line tests', cmd: 'npm run test:phone' },
  { label: 'Domain health', cmd: 'npm run test:domain' },
  { label: 'Local dev (API + UI)', cmd: 'npm run dev' }
];

const ENV_VARS = [
  { name: 'TWILIO_ACCOUNT_SID', purpose: 'Phone tests', required: 'For live calls' },
  { name: 'TWILIO_AUTH_TOKEN', purpose: 'Phone tests', required: 'For live calls' },
  { name: 'TWILIO_FROM_NUMBER', purpose: 'Phone tests', required: 'For live calls' },
  { name: 'MXTOOLBOX_API_KEY', purpose: 'Domain reputation', required: 'Optional' },
  { name: 'ABUSEIPDB_API_KEY', purpose: 'IP reputation', required: 'Optional' },
  { name: 'VIRUSTOTAL_API_KEY', purpose: 'Threat scanning', required: 'Optional' },
  { name: 'DASHBOARD_API_PORT', purpose: 'Local API port', required: 'Default 3847' }
];

const renderServiceCard = (service, health) => {
  const { label, tone, detail } = service.status(health);
  return `
    <article class="service-card" data-service="${service.id}">
      <div class="service-card-head">
        <span class="service-icon" aria-hidden="true">${service.icon}</span>
        <div>
          <h3>${service.name}</h3>
          <p>${service.desc}</p>
        </div>
      </div>
      <span class="status-pill ${tone}">${label}</span>
      <p class="service-detail">${detail}</p>
    </article>`;
};

const configuredCount = (health) =>
  SERVICE_DEFS.filter((s) => {
    const { tone } = s.status(health);
    return tone === 'ok';
  }).length;

export const renderSettings = (apiHealth) => {
  const historyCount = getHistory().length;
  const onPages = isGitHubPages();
  const theme = document.documentElement.getAttribute('data-theme') || 'light';
  const activeCount = configuredCount(apiHealth);

  return `
    <section class="page-header">
      <div>
        <p class="page-eyebrow">Configuration</p>
        <h1>Settings</h1>
        <p class="page-desc">Connect the local API, tune appearance, and review which services are active. Secrets stay in <code>.env</code> on the server — never in the browser.</p>
      </div>
      <div class="page-actions">
        <button type="button" class="btn btn-secondary btn-sm" id="settings-refresh">Refresh status</button>
      </div>
    </section>

    <div class="settings-banner ${apiHealth ? 'settings-banner-online' : 'settings-banner-offline'}">
      <div class="settings-banner-icon" aria-hidden="true">${apiHealth ? '✓' : '○'}</div>
      <div class="settings-banner-body">
        <strong>${apiHealth ? 'Live API connected' : onPages ? 'GitHub Pages — mock mode' : 'API not reachable'}</strong>
        <p>${
          apiHealth
            ? `Running against <code>${escapeHtml(API_BASE)}</code> with ${activeCount} of ${SERVICE_DEFS.length} services ready.`
            : onPages
              ? 'This hosted build cannot reach a local API. Clone the repo and run <code>npm run dev</code> for full checks.'
              : 'Start the API with <code>npm run dev:api</code>, then test the connection below.'
        }</p>
      </div>
      <span class="settings-mode-pill">${onPages ? 'Hosted' : 'Local'}</span>
    </div>

    <div class="stats-grid settings-stats">
      <article class="stat-card">
        <span class="stat-label">API status</span>
        <span class="stat-value stat-value-sm">${apiHealth ? 'Online' : 'Offline'}</span>
      </article>
      <article class="stat-card">
        <span class="stat-label">Services ready</span>
        <span class="stat-value">${activeCount}<span class="stat-suffix">/${SERVICE_DEFS.length}</span></span>
      </article>
      <article class="stat-card">
        <span class="stat-label">Saved runs</span>
        <span class="stat-value">${historyCount}</span>
      </article>
      <article class="stat-card">
        <span class="stat-label">Theme</span>
        <span class="stat-value stat-value-sm">${theme === 'dark' ? 'Dark' : 'Light'}</span>
      </article>
    </div>

    <div class="settings-grid">
      <div class="settings-column">
        <article class="panel-card">
          <div class="panel-header">
            <h2>API connection</h2>
            <span class="status-pill ${apiHealth ? 'ok' : 'warn'}" id="api-status-pill">${apiHealth ? 'Connected' : 'Offline'}</span>
          </div>
          <form id="settings-form" class="check-form settings-form">
            <label for="api-base">Local API base URL</label>
            <div class="input-row settings-input-row">
              <input type="url" id="api-base" name="api-base" value="${escapeHtml(API_BASE || '')}" placeholder="http://127.0.0.1:3847" autocomplete="url" />
              <button type="button" class="btn btn-secondary btn-sm" id="test-api-btn">Test</button>
            </div>
            <div class="api-presets" role="group" aria-label="API URL presets">
              <button type="button" class="chip" data-api-preset="http://127.0.0.1:3847">localhost:3847</button>
              <button type="button" class="chip" data-api-preset="http://127.0.0.1:3848">localhost:3848</button>
              <button type="button" class="chip" data-api-preset="">GitHub Pages (mock)</button>
            </div>
            <p class="hint">Run <code>npm run dev</code> for API + dashboard together, or <code>npm run dev:api</code> on port 3847.</p>
            <div class="settings-form-actions">
              <button type="submit" class="btn btn-primary">Save &amp; reload</button>
            </div>
            <p class="settings-test-result muted" id="api-test-result" hidden></p>
          </form>
        </article>

        <article class="panel-card">
          <h2>Appearance</h2>
          <div class="theme-picker" role="radiogroup" aria-label="Color theme">
            <label class="theme-option ${theme === 'light' ? 'active' : ''}">
              <input type="radio" name="theme" value="light" ${theme === 'light' ? 'checked' : ''} />
              <span class="theme-preview theme-preview-light" aria-hidden="true"></span>
              <span>Light</span>
            </label>
            <label class="theme-option ${theme === 'dark' ? 'active' : ''}">
              <input type="radio" name="theme" value="dark" ${theme === 'dark' ? 'checked' : ''} />
              <span class="theme-preview theme-preview-dark" aria-hidden="true"></span>
              <span>Dark</span>
            </label>
            <label class="theme-option ${!localStorage.getItem(STORAGE_KEYS.theme) ? 'active' : ''}">
              <input type="radio" name="theme" value="system" ${!localStorage.getItem(STORAGE_KEYS.theme) ? 'checked' : ''} />
              <span class="theme-preview theme-preview-system" aria-hidden="true"></span>
              <span>System</span>
            </label>
          </div>
          <p class="hint">Theme is saved in your browser and syncs with the toggle in the top bar.</p>
        </article>

        <article class="panel-card">
          <h2>Local data</h2>
          <p class="muted settings-data-desc">Test history and stats are stored in <code>localStorage</code> on this device only.</p>
          <div class="settings-data-actions">
            <button type="button" class="btn btn-secondary btn-sm" id="clear-history-btn" ${historyCount ? '' : 'disabled'}>Clear history (${historyCount})</button>
          </div>
        </article>
      </div>

      <div class="settings-column">
        <article class="panel-card">
          <div class="panel-header">
            <h2>Service status</h2>
            <span class="muted settings-updated" id="services-updated">Just now</span>
          </div>
          <div class="service-grid" id="service-grid">
            ${SERVICE_DEFS.map((s) => renderServiceCard(s, apiHealth)).join('')}
          </div>
        </article>

        <details class="settings-accordion">
          <summary class="settings-accordion-trigger">
            <span class="accordion-icon" aria-hidden="true">⌨️</span>
            <span>CLI automation</span>
            <span class="accordion-chevron" aria-hidden="true"></span>
          </summary>
          <div class="settings-accordion-body">
            <p class="muted">Playwright and Twilio scripts in <code>src/</code> remain the source of truth for scheduled CI runs.</p>
            <ul class="cmd-list">
              ${CLI_COMMANDS.map(
                (item) => `
                <li>
                  <div class="cmd-list-meta">
                    <strong>${item.label}</strong>
                    <code>${item.cmd}</code>
                  </div>
                  <button type="button" class="btn btn-secondary btn-sm cmd-copy" data-copy="${item.cmd}">Copy</button>
                </li>`
              ).join('')}
            </ul>
          </div>
        </details>

        <details class="settings-accordion">
          <summary class="settings-accordion-trigger">
            <span class="accordion-icon" aria-hidden="true">🔐</span>
            <span>Environment variables</span>
            <span class="accordion-chevron" aria-hidden="true"></span>
          </summary>
          <div class="settings-accordion-body">
            <p class="muted">Copy <code>.env.example</code> to <code>.env</code> and fill in only what you need. Keys are never sent to the browser.</p>
            <div class="table-scroll">
              <table class="data-table compact env-ref-table">
                <thead>
                  <tr><th>Variable</th><th>Purpose</th><th>Notes</th></tr>
                </thead>
                <tbody>
                  ${ENV_VARS.map(
                    (row) => `
                    <tr>
                      <td><code>${row.name}</code></td>
                      <td>${row.purpose}</td>
                      <td>${row.required}</td>
                    </tr>`
                  ).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </details>
      </div>
    </div>

    <div class="settings-toast" id="settings-toast" role="status" aria-live="polite" hidden></div>
  `;
};

const showToast = (root, message, tone = 'info') => {
  const toast = root.querySelector('#settings-toast');
  if (!toast) return;
  toast.textContent = message;
  toast.className = `settings-toast settings-toast-${tone}`;
  toast.hidden = false;
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    toast.hidden = true;
  }, 3200);
};

const applyTheme = (value) => {
  let theme = value;
  if (value === 'system') {
    localStorage.removeItem(STORAGE_KEYS.theme);
    theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } else {
    localStorage.setItem(STORAGE_KEYS.theme, value);
  }
  document.documentElement.setAttribute('data-theme', theme);
  const toggle = document.getElementById('theme-toggle');
  if (toggle) toggle.textContent = theme === 'dark' ? '☀️' : '🌙';
};

const refreshServiceGrid = (root, health) => {
  const grid = root.querySelector('#service-grid');
  if (!grid) return;
  grid.innerHTML = SERVICE_DEFS.map((s) => renderServiceCard(s, health)).join('');

  const pill = root.querySelector('#api-status-pill');
  if (pill) {
    pill.textContent = health ? 'Connected' : 'Offline';
    pill.className = `status-pill ${health ? 'ok' : 'warn'}`;
  }

  const updated = root.querySelector('#services-updated');
  if (updated) updated.textContent = `Updated ${new Date().toLocaleTimeString()}`;
};

export const bindSettings = (root) => {
  const apiInput = root.querySelector('#api-base');
  const testResult = root.querySelector('#api-test-result');

  root.querySelector('#settings-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const url = apiInput?.value.trim() ?? '';
    setApiBase(url);
  });

  root.querySelectorAll('[data-api-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (apiInput) apiInput.value = btn.dataset.apiPreset;
      showToast(root, 'Preset applied — save to reload', 'info');
    });
  });

  root.querySelector('#test-api-btn')?.addEventListener('click', async () => {
    const url = apiInput?.value.trim();
    if (!url) {
      if (testResult) {
        testResult.hidden = false;
        testResult.textContent = 'No API URL — mock mode will be used on GitHub Pages.';
        testResult.className = 'settings-test-result muted';
      }
      return;
    }

    if (testResult) {
      testResult.hidden = false;
      testResult.textContent = 'Testing connection…';
      testResult.className = 'settings-test-result muted';
    }

    try {
      const health = await probeApiHealth(url);
      if (health) {
        if (testResult) {
          testResult.textContent = `✓ Connected — ${configuredCount(health)} services ready. Save to apply permanently.`;
          testResult.className = 'settings-test-result settings-test-ok';
        }
        refreshServiceGrid(root, health);
        showToast(root, 'API reachable', 'ok');
      } else {
        if (testResult) {
          testResult.textContent = '✗ Could not reach API. Is npm run dev:api running?';
          testResult.className = 'settings-test-result settings-test-fail';
        }
        refreshServiceGrid(root, null);
        showToast(root, 'API unreachable', 'error');
      }
    } catch {
      if (testResult) {
        testResult.textContent = '✗ Connection failed.';
        testResult.className = 'settings-test-result settings-test-fail';
      }
    }
  });

  root.querySelector('#settings-refresh')?.addEventListener('click', async () => {
    const btn = root.querySelector('#settings-refresh');
    if (btn) btn.disabled = true;
    try {
      const health = await checkApiHealth();
      refreshServiceGrid(root, health);
      showToast(root, health ? 'Status refreshed' : 'Still offline', health ? 'ok' : 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  root.querySelectorAll('input[name="theme"]').forEach((input) => {
    input.addEventListener('change', () => {
      root.querySelectorAll('.theme-option').forEach((opt) => {
        opt.classList.toggle('active', opt.querySelector('input')?.checked);
      });
      applyTheme(input.value);
      showToast(root, `Theme set to ${input.value}`, 'ok');
    });
  });

  root.querySelectorAll('.cmd-copy').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const text = btn.dataset.copy;
      try {
        await navigator.clipboard.writeText(text);
        showToast(root, `Copied: ${text}`, 'ok');
      } catch {
        showToast(root, 'Copy failed — select manually', 'error');
      }
    });
  });

  root.querySelector('#clear-history-btn')?.addEventListener('click', () => {
    if (!confirm('Clear all local test history? This cannot be undone.')) return;
    clearHistory();
    const btn = root.querySelector('#clear-history-btn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Clear history (0)';
    }
    const stat = root.querySelector('.settings-stats .stat-card:nth-child(3) .stat-value');
    if (stat) stat.textContent = '0';
    showToast(root, 'History cleared', 'ok');
  });
};

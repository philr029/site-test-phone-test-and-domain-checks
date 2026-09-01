/**
 * QA Testing Dashboard — main application entry
 */
import { checkApiHealth } from './services/api-client.js';
import { renderSidebar, navigateTo, PAGES } from './components/nav.js';
import { renderDashboard, bindDashboard } from './pages/dashboard.js';
import { renderSiteTests, bindSiteTests } from './pages/site-tests.js';
import { renderPhoneTests, bindPhoneTests } from './pages/phone-tests.js';
import { renderDomainChecks, bindDomainChecks } from './pages/domain-checks.js';
import { renderSpreadsheet, bindSpreadsheet } from './pages/spreadsheet.js';
import { renderReports, bindReports } from './pages/reports.js';
import { renderSettings, bindSettings } from './pages/settings.js';
import { STORAGE_KEYS } from './config.js';

const pageRenderers = {
  dashboard: renderDashboard,
  'site-tests': renderSiteTests,
  'phone-tests': renderPhoneTests,
  'domain-checks': renderDomainChecks,
  spreadsheet: renderSpreadsheet,
  reports: renderReports,
  settings: renderSettings
};

const pageBinders = {
  dashboard: bindDashboard,
  'site-tests': bindSiteTests,
  'phone-tests': bindPhoneTests,
  'domain-checks': bindDomainChecks,
  spreadsheet: bindSpreadsheet,
  reports: bindReports,
  settings: bindSettings
};

let apiHealth = null;

const initTheme = () => {
  const stored = localStorage.getItem(STORAGE_KEYS.theme);
  const theme =
    stored === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : stored || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);
  const toggle = document.getElementById('theme-toggle');
  if (toggle) {
    toggle.textContent = theme === 'dark' ? '☀️' : '🌙';
    toggle.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem(STORAGE_KEYS.theme, next);
      toggle.textContent = next === 'dark' ? '☀️' : '🌙';
    });
  }
};

const loadPage = (pageId) => {
  const panel = document.getElementById(`page-${pageId}`);
  if (!panel) return;
  const render = pageRenderers[pageId];
  panel.innerHTML = render(apiHealth);
  pageBinders[pageId]?.(panel);
};

const init = async () => {
  initTheme();
  apiHealth = await checkApiHealth();

  const shell = document.getElementById('app-shell');
  if (!shell) return;

  const initialPage = location.hash.replace('#', '') || 'dashboard';
  const validPage = PAGES.some((p) => p.id === initialPage) ? initialPage : 'dashboard';

  shell.innerHTML = `
    ${renderSidebar(validPage, apiHealth)}
    <div class="main-area">
      <header class="top-bar">
        <button type="button" class="mobile-nav-btn" id="mobile-nav-btn" aria-label="Menu">☰</button>
        <button type="button" class="theme-toggle" id="theme-toggle" aria-label="Toggle theme">🌙</button>
      </header>
      <main class="page-content">
        ${PAGES.map((p) => `<section class="page-panel ${p.id === validPage ? 'active' : ''}" id="page-${p.id}"></section>`).join('')}
      </main>
    </div>`;

  initTheme();

  PAGES.forEach((p) => loadPage(p.id));
  shell.removeAttribute('aria-busy');
  shell.querySelector('.boot-loader')?.remove();

  shell.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      navigateTo(btn.dataset.page);
      shell.querySelector('.sidebar')?.classList.remove('open');
    });
  });

  document.getElementById('mobile-nav-btn')?.addEventListener('click', () => {
    shell.querySelector('.sidebar')?.classList.toggle('open');
  });

  window.addEventListener('hashchange', () => {
    const page = location.hash.replace('#', '') || 'dashboard';
    if (PAGES.some((p) => p.id === page)) navigateTo(page);
  });
};

document.addEventListener('DOMContentLoaded', init);

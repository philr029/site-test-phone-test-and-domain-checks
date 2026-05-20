export const PAGES = [
  { id: 'dashboard', label: 'Dashboard', icon: '◉' },
  { id: 'site-tests', label: 'Site Tests', icon: '🌐' },
  { id: 'phone-tests', label: 'Phone Tests', icon: '📞' },
  { id: 'domain-checks', label: 'Domain & IP', icon: '🛡' },
  { id: 'spreadsheet', label: 'Spreadsheet', icon: '📊' },
  { id: 'reports', label: 'Reports', icon: '📁' },
  { id: 'settings', label: 'Settings', icon: '⚙️' }
];

export const renderSidebar = (activeId, apiStatus) => {
  const apiPill = apiStatus
    ? '<span class="api-pill online">API connected</span>'
    : '<span class="api-pill offline">Mock / offline mode</span>';

  return `
    <aside class="sidebar" aria-label="Main navigation">
      <div class="sidebar-brand">
        <span class="brand-logo" aria-hidden="true">◆</span>
        <div>
          <span class="brand-title">QA Dashboard</span>
          <span class="brand-sub">Lead quality checks</span>
        </div>
      </div>
      ${apiPill}
      <nav class="sidebar-nav">
        ${PAGES.map(
          (p) => `
          <button type="button" class="nav-item ${p.id === activeId ? 'active' : ''}" data-page="${p.id}">
            <span class="nav-icon" aria-hidden="true">${p.icon}</span>
            <span>${p.label}</span>
          </button>`
        ).join('')}
      </nav>
      <div class="sidebar-footer">
        <a class="btn btn-secondary btn-sm" href="https://github.com/philr029/site-test-phone-test-and-domain-checks" target="_blank" rel="noopener">GitHub</a>
      </div>
    </aside>
  `;
};

export const navigateTo = (pageId) => {
  document.querySelectorAll('.page-panel').forEach((el) => {
    el.classList.toggle('active', el.id === `page-${pageId}`);
  });
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.page === pageId);
  });
  history.replaceState(null, '', `#${pageId}`);
};

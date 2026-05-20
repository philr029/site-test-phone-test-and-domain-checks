import { badgeHtml } from './badges.js';

export const resultCardHtml = ({ title, subtitle, status, checks = [], footer = '' }) => {
  const checkList = Array.isArray(checks)
    ? checks
    : Object.values(checks).map((c) => ({
        name: c.name || 'Check',
        status: c.status,
        detail: c.detail || ''
      }));

  return `
    <article class="result-card">
      <header class="result-card-header">
        <div>
          <h3>${title}</h3>
          ${subtitle ? `<p class="result-sub">${subtitle}</p>` : ''}
        </div>
        ${status ? badgeHtml(status) : ''}
      </header>
      <ul class="result-check-list">
        ${checkList
          .map(
            (c) => `
          <li>
            <span class="check-name">${c.name}</span>
            ${badgeHtml(c.status)}
            <span class="check-detail">${c.detail || ''}</span>
          </li>`
          )
          .join('')}
      </ul>
      ${footer ? `<footer class="result-card-footer">${footer}</footer>` : ''}
    </article>
  `;
};

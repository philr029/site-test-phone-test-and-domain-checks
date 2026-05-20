export const loadingHtml = (message = 'Running checks…') => `
  <div class="loading-state" role="status" aria-live="polite">
    <div class="loading-spinner" aria-hidden="true"></div>
    <p>${message}</p>
  </div>
`;

export const emptyStateHtml = ({ icon = '📋', title, message, actionHtml = '' }) => `
  <div class="empty-state">
    <div class="empty-icon" aria-hidden="true">${icon}</div>
    <h3>${title}</h3>
    <p>${message}</p>
    ${actionHtml ? `<div class="empty-actions">${actionHtml}</div>` : ''}
  </div>
`;

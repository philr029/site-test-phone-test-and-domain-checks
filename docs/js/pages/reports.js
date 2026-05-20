import { getHistory, clearHistory } from '../storage.js';
import { exportCsv, exportJson } from '../components/export-buttons.js';
import { emptyStateHtml } from '../components/loading.js';

export const renderReports = () => {
  const history = getHistory();
  return `
    <section class="page-header">
      <div>
        <p class="page-eyebrow">History</p>
        <h1>Reports / History</h1>
        <p class="page-desc">Stored locally in your browser — ready to sync to a database later.</p>
      </div>
      <div class="page-actions">
        <button type="button" class="btn btn-secondary btn-sm" id="export-json">Export JSON</button>
        <button type="button" class="btn btn-secondary btn-sm" id="export-csv">Export CSV</button>
        <button type="button" class="btn btn-secondary btn-sm danger" id="clear-history">Clear</button>
      </div>
    </section>
    <div id="reports-content">
      ${
        history.length
          ? `<table class="data-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Test type</th>
            <th>Target</th>
            <th>Checked</th>
            <th>Pass</th>
            <th>Warn</th>
            <th>Fail</th>
          </tr>
        </thead>
        <tbody>
          ${history
            .map(
              (h) => `<tr>
            <td>${new Date(h.date).toLocaleString()}</td>
            <td>${h.testType}</td>
            <td>${h.target || '—'}</td>
            <td>${h.summary?.total ?? h.summary?.checked ?? 1}</td>
            <td>${h.summary?.pass ?? '—'}</td>
            <td>${h.summary?.warn ?? '—'}</td>
            <td>${h.summary?.fail ?? '—'}</td>
          </tr>`
            )
            .join('')}
        </tbody>
      </table>`
          : emptyStateHtml({
              icon: '📁',
              title: 'No history yet',
              message: 'Run site, phone, domain, or spreadsheet checks to build your local report history.'
            })
      }
    </div>`;
};

export const bindReports = (root) => {
  root.querySelector('#export-json')?.addEventListener('click', () => {
    exportJson(`qa-history-${Date.now()}.json`, getHistory());
  });

  root.querySelector('#export-csv')?.addEventListener('click', () => {
    exportCsv(`qa-history-${Date.now()}.csv`, getHistory(), [
      { label: 'date', value: (h) => h.date },
      { label: 'testType', value: (h) => h.testType },
      { label: 'target', value: (h) => h.target },
      { label: 'pass', value: (h) => h.summary?.pass },
      { label: 'warn', value: (h) => h.summary?.warn },
      { label: 'fail', value: (h) => h.summary?.fail }
    ]);
  });

  root.querySelector('#clear-history')?.addEventListener('click', () => {
    if (confirm('Clear all local history?')) {
      clearHistory();
      root.querySelector('#reports-content').innerHTML = emptyStateHtml({
        icon: '📁',
        title: 'History cleared',
        message: 'Run new checks to populate reports.'
      });
    }
  });
};

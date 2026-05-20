const statusClass = (status) => {
  if (status === 'passed') return 'status-passed';
  if (status === 'skipped') return 'status-skipped';
  if (status === 'warning') return 'status-warning';
  return 'status-failed';
};

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export const buildHtmlReport = (report) => {
  const rows = (report.entries || [])
    .map(
      (entry) => `
      <tr>
        <td>${escapeHtml(entry.targetName)}</td>
        <td>${escapeHtml(entry.testCategory)}</td>
        <td><span class="pill ${statusClass(entry.status)}">${escapeHtml(entry.status)}</span></td>
        <td>${escapeHtml(entry.summary)}</td>
        <td>${escapeHtml(entry.skippedReason || '—')}</td>
        <td>${escapeHtml(entry.recommendedNextAction || '—')}</td>
      </tr>`
    )
    .join('');

  const attention = (report.needsAttention || [])
    .map(
      (item) =>
        `<li><strong>${escapeHtml(item.targetName)}</strong> (${escapeHtml(item.testCategory)}): ${escapeHtml(item.summary)}</li>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Automation Run Report</title>
  <style>
    :root {
      --bg: #0b1220;
      --card: #121a2b;
      --text: #e8eefc;
      --muted: #9fb0d0;
      --accent: #4f8cff;
      --pass: #1f9d63;
      --fail: #e05252;
      --warn: #d6a23a;
      --skip: #6b7a99;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
      background: radial-gradient(circle at top right, #1a2744, var(--bg) 45%);
      color: var(--text);
      line-height: 1.5;
    }
    .wrap { max-width: 1100px; margin: 0 auto; padding: 2rem 1.25rem 3rem; }
    .hero {
      background: linear-gradient(135deg, #1c2f57, #121a2b);
      border: 1px solid #2a3b63;
      border-radius: 16px;
      padding: 1.5rem;
      margin-bottom: 1.25rem;
    }
    h1 { margin: 0 0 0.35rem; font-size: 1.8rem; }
    .meta { color: var(--muted); font-size: 0.95rem; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 0.75rem;
      margin: 1rem 0;
    }
    .stat {
      background: var(--card);
      border: 1px solid #2a3b63;
      border-radius: 12px;
      padding: 0.85rem;
    }
    .stat strong { display: block; font-size: 1.4rem; }
    .card {
      background: var(--card);
      border: 1px solid #2a3b63;
      border-radius: 14px;
      padding: 1rem;
      margin-bottom: 1rem;
    }
    table { width: 100%; border-collapse: collapse; font-size: 0.92rem; }
    th, td { text-align: left; padding: 0.65rem; border-bottom: 1px solid #2a3b63; vertical-align: top; }
    th { color: var(--muted); font-weight: 600; }
    .pill {
      display: inline-block;
      padding: 0.15rem 0.55rem;
      border-radius: 999px;
      font-size: 0.78rem;
      font-weight: 600;
      text-transform: uppercase;
    }
    .status-passed { background: rgba(31,157,99,0.2); color: #7dffc0; }
    .status-failed { background: rgba(224,82,82,0.2); color: #ffb4b4; }
    .status-warning { background: rgba(214,162,58,0.2); color: #ffe2a8; }
    .status-skipped { background: rgba(107,122,153,0.25); color: #d5def5; }
    ul { margin: 0.4rem 0 0; padding-left: 1.2rem; }
    .overall-${report.status} strong { color: var(--accent); }
  </style>
</head>
<body>
  <div class="wrap">
    <section class="hero">
      <h1>Marketing + IT Automation Report</h1>
      <p class="meta">Generated: ${escapeHtml(report.generatedAt)} · Environment: ${escapeHtml(report.environment)} · Overall: <strong>${escapeHtml(report.status)}</strong></p>
      <div class="grid">
        <div class="stat overall-${report.status}"><span>Overall</span><strong>${escapeHtml(report.status)}</strong></div>
        <div class="stat"><span>Passed</span><strong>${report.summary?.passed || 0}</strong></div>
        <div class="stat"><span>Failed</span><strong>${report.summary?.failed || 0}</strong></div>
        <div class="stat"><span>Warnings</span><strong>${report.summary?.warning || 0}</strong></div>
        <div class="stat"><span>Skipped</span><strong>${report.summary?.skipped || 0}</strong></div>
      </div>
    </section>

    <section class="card">
      <h2>Needs attention</h2>
      ${attention ? `<ul>${attention}</ul>` : '<p>Nothing flagged. Great run.</p>'}
    </section>

    <section class="card">
      <h2>All checks</h2>
      <table>
        <thead>
          <tr>
            <th>Target</th>
            <th>Category</th>
            <th>Status</th>
            <th>Summary</th>
            <th>Skipped reason</th>
            <th>Next action</th>
          </tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="6">No report entries found. Run npm run test:e2e first.</td></tr>'}</tbody>
      </table>
    </section>
  </div>
</body>
</html>`;
};

/** Status badge helpers */
export const statusLabel = (status) => {
  const map = {
    pass: 'Pass',
    fail: 'Fail',
    warn: 'Warning',
    warning: 'Warning',
    skip: 'Skipped',
    info: 'Info'
  };
  return map[status] || status || 'Unknown';
};

export const badgeHtml = (status, text) => {
  const label = text || statusLabel(status);
  const cls = ['pass', 'fail', 'warn', 'warning', 'skip', 'info'].includes(status)
    ? status === 'warning'
      ? 'warn'
      : status
    : 'info';
  return `<span class="status-badge ${cls}">${label}</span>`;
};

export const summarizeChecks = (checks = []) =>
  checks.reduce(
    (acc, c) => {
      const s = c.status || (c.passed ? 'pass' : c.passed === false ? 'fail' : 'warn');
      if (s === 'pass') acc.pass += 1;
      else if (s === 'fail') acc.fail += 1;
      else if (s === 'skip') acc.skip += 1;
      else acc.warn += 1;
      return acc;
    },
    { pass: 0, warn: 0, fail: 0, skip: 0 }
  );

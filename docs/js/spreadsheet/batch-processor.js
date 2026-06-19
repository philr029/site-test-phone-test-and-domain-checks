/**
 * Batch execution — run domain, phone, and site checks per spreadsheet row.
 */

const statusFromSummary = (summary) => {
  if (!summary) return 'skip';
  if (summary.fail > 0) return 'fail';
  if (summary.warn > 0) return 'warn';
  if (summary.pass > 0) return 'pass';
  return 'skip';
};

const summarizeResults = (checks) =>
  checks.reduce(
    (acc, c) => {
      const s = c.status ?? 'skip';
      acc[s === 'pass' ? 'pass' : s === 'fail' ? 'fail' : s === 'skip' ? 'skip' : 'warn'] += 1;
      return acc;
    },
    { pass: 0, warn: 0, fail: 0, skip: 0 }
  );

/**
 * Resolve check targets from a validated row and user column mapping.
 * @param {object} row
 * @param {object} checkMapping - { domain?: number, phone?: number, site?: number }
 * @param {'raw'|'cleaned'} viewMode
 */
export const resolveCheckTargets = (row, checkMapping, viewMode = 'cleaned') => {
  const cells = viewMode === 'cleaned' ? row.cleaned ?? row.cells : row.cells;
  const get = (colIdx) => (colIdx !== undefined && colIdx !== '' ? (cells[colIdx] ?? '').trim() : '');

  const domainCol = checkMapping.domain;
  const phoneCol = checkMapping.phone;
  const siteCol = checkMapping.site;

  let domain = get(domainCol) || row.domain;
  let ip = row.ip;
  let phone = get(phoneCol) || row.phone;
  let site = get(siteCol) || row.url;

  if (!domain && !ip && domainCol === undefined) {
    domain = row.domain;
    ip = row.ip;
  }

  return { domain, ip, phone, site, company: row.company };
};

/**
 * @param {object} params
 */
export const runBatch = async ({
  rows,
  checkTypes = ['domain'],
  checkMapping = {},
  viewMode = 'cleaned',
  runners,
  onProgress,
  signal
}) => {
  const results = [];
  const total = rows.length;

  for (let i = 0; i < rows.length; i++) {
    if (signal?.aborted) break;

    const row = rows[i];
    const targets = resolveCheckTargets(row, checkMapping, viewMode);
    const rowResult = {
      index: row.index,
      company: targets.company,
      domain: targets.domain,
      ip: targets.ip,
      phone: targets.phone,
      site: targets.site,
      valid: row.valid,
      checks: {},
      status: 'skip',
      detail: '',
      summary: { pass: 0, warn: 0, fail: 0, skip: 0 }
    };

    if (!row.valid) {
      rowResult.status = 'warn';
      rowResult.detail = row.issues?.join('; ') ?? 'Validation failed';
      results.push(rowResult);
      onProgress?.({ current: i + 1, total, percent: Math.round(((i + 1) / total) * 100), row: rowResult });
      continue;
    }

    const checkOutcomes = [];

    for (const checkType of checkTypes) {
      if (signal?.aborted) break;

      try {
        if (checkType === 'domain') {
          const target = targets.domain || targets.ip;
          if (!target) {
            rowResult.checks.domain = { status: 'skip', detail: 'No domain or IP column mapped' };
            checkOutcomes.push(rowResult.checks.domain);
            continue;
          }
          const result = await runners.runDomainCheck(target);
          const status = statusFromSummary(result.summary);
          rowResult.checks.domain = { status, summary: result.summary, result };
          checkOutcomes.push({ status });
        }

        if (checkType === 'site') {
          const url = targets.site;
          if (!url) {
            rowResult.checks.site = { status: 'skip', detail: 'No URL/site column mapped' };
            checkOutcomes.push(rowResult.checks.site);
            continue;
          }
          const normalized = url.startsWith('http') ? url : `https://${url}`;
          const result = await runners.runSiteCheck(normalized);
          const status = statusFromSummary(result.summary);
          rowResult.checks.site = { status, summary: result.summary, result };
          checkOutcomes.push({ status });
        }

        if (checkType === 'phone') {
          const phone = targets.phone;
          if (!phone) {
            rowResult.checks.phone = { status: 'skip', detail: 'No phone column mapped' };
            checkOutcomes.push(rowResult.checks.phone);
            continue;
          }
          const result = await runners.runPhoneTest({
            phoneNumber: phone,
            testName: targets.company || `Row ${row.index}`,
            notes: `Spreadsheet batch row ${row.index}`
          });
          const status = result.passed === true ? 'pass' : result.passed === false ? 'fail' : result.status ?? 'warn';
          rowResult.checks.phone = { status, result };
          checkOutcomes.push({ status });
        }
      } catch (err) {
        rowResult.checks[checkType] = { status: 'fail', detail: err.message };
        checkOutcomes.push({ status: 'fail' });
      }
    }

    rowResult.summary = summarizeResults(checkOutcomes);
    rowResult.status = statusFromSummary(rowResult.summary);
    results.push(rowResult);

    onProgress?.({ current: i + 1, total, percent: Math.round(((i + 1) / total) * 100), row: rowResult });

    // Yield to UI thread between rows
    await new Promise((r) => setTimeout(r, 0));
  }

  const batchSummary = results.reduce(
    (acc, r) => {
      acc[r.status === 'pass' ? 'pass' : r.status === 'fail' ? 'fail' : r.status === 'skip' ? 'skip' : 'warn'] += 1;
      acc.total += 1;
      return acc;
    },
    { pass: 0, warn: 0, fail: 0, skip: 0, total: 0 }
  );

  return { results, summary: batchSummary };
};

/**
 * Suggest column mapping for batch checks from auto-detected aliases.
 * @param {string[]} headers
 * @param {Record<string, number>} columnMapping
 */
export const suggestCheckMapping = (headers, columnMapping = {}) => ({
  domain: columnMapping.domain ?? columnMapping.ip ?? '',
  phone: columnMapping.phone ?? '',
  site: columnMapping.url ?? columnMapping.website ?? ''
});

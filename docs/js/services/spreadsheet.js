/** Parse CSV / XLSX and detect columns */
const COLUMN_ALIASES = {
  domain: ['domain', 'domains', 'hostname', 'host'],
  ip: ['ip', 'ips', 'ip address', 'ipaddress', 'ip_address'],
  website: ['website', 'site', 'web'],
  url: ['url', 'link', 'uri'],
  company: ['company', 'name', 'organisation', 'organization', 'org', 'client']
};

const normalizeHeader = (h) => String(h || '').trim().toLowerCase();

export const detectColumns = (headers) => {
  const mapping = {};
  headers.forEach((header, index) => {
    const norm = normalizeHeader(header);
    for (const [key, aliases] of Object.entries(COLUMN_ALIASES)) {
      if (aliases.includes(norm) && mapping[key] === undefined) {
        mapping[key] = index;
      }
    }
  });
  return mapping;
};

export const parseCsv = (text) => {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { headers: [], rows: [] };
  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  const rows = lines.slice(1).map((line) => {
    const cells = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === ',' && !inQuotes) {
        cells.push(cur.trim().replace(/^"|"$/g, ''));
        cur = '';
      } else cur += ch;
    }
    cells.push(cur.trim().replace(/^"|"$/g, ''));
    return cells;
  });
  return { headers, rows };
};

export const parseXlsx = async (arrayBuffer) => {
  if (!window.XLSX) throw new Error('XLSX library not loaded');
  const wb = window.XLSX.read(arrayBuffer, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const data = window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (!data.length) return { headers: [], rows: [] };
  const headers = data[0].map(String);
  const rows = data.slice(1).map((r) => r.map(String));
  return { headers, rows };
};

export const validateRow = (row, mapping) => {
  const get = (key) => (mapping[key] !== undefined ? row[mapping[key]]?.trim() : '');
  const domain = get('domain');
  const ip = get('ip');
  const url = get('url') || get('website');
  const issues = [];

  if (!domain && !ip && !url) issues.push('No domain, IP, or URL');
  if (url && !/^https?:\/\//i.test(url) && url.includes(' ')) issues.push('Invalid URL format');
  if (ip && !/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) issues.push('Invalid IP format');

  return {
    domain,
    ip,
    url,
    company: get('company'),
    valid: issues.length === 0,
    issues
  };
};

export const rowsToObjects = (headers, rows, mapping) =>
  rows.map((cells, index) => {
    const validated = validateRow(cells, mapping);
    return { index: index + 1, cells, ...validated };
  });

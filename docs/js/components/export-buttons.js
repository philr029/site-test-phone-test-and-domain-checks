/** CSV / JSON export utilities */
export const downloadBlob = (filename, content, mime = 'text/plain') => {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

export const toCsv = (rows, columns) => {
  const escape = (v) => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const header = columns.map((c) => escape(c.label)).join(',');
  const lines = rows.map((row) => columns.map((c) => escape(c.value(row))).join(','));
  return [header, ...lines].join('\n');
};

export const exportJson = (filename, data) => {
  downloadBlob(filename, JSON.stringify(data, null, 2), 'application/json');
};

export const exportCsv = (filename, rows, columns) => {
  downloadBlob(filename, toCsv(rows, columns), 'text/csv');
};

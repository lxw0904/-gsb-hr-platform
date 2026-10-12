export function jsonStringify(value) {
  return JSON.stringify(value ?? {});
}

export function normalizePagination(query, defaults = { page: 1, pageSize: 10 }) {
  const page = Math.max(1, Number.parseInt(query.page || defaults.page, 10) || defaults.page);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(query.pageSize || defaults.pageSize, 10) || defaults.pageSize));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function resolveSort(query, allowedColumns, fallbackColumn, fallbackOrder = 'ASC') {
  const sortBy = allowedColumns[query.sortBy] || allowedColumns[fallbackColumn] || fallbackColumn;
  const sortOrder = String(query.sortOrder || fallbackOrder).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
  return { sortBy, sortOrder };
}

export function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  if (/[\",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function toCsv(headers, rows) {
  const lines = [headers.map((item) => csvCell(item.label)).join(',')];
  for (const row of rows) {
    lines.push(headers.map((item) => csvCell(row[item.key])).join(','));
  }
  return `\uFEFF${lines.join('\r\n')}`;
}

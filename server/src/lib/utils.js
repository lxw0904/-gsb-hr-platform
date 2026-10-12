const db = require('./db');
const config = require('../config');

class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function now() {
  return new Date().toISOString();
}

function requireFields(body, fields) {
  const missing = fields.filter((field) => body[field] === undefined || body[field] === null || body[field] === '');
  if (missing.length) throw new AppError(400, 'VALIDATION_ERROR', `缺少必填字段：${missing.join('、')}`);
}

function optionalNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function pagination(query, allowedSortFields, defaultSort = 'created_at') {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(query.pageSize, 10) || 10));
  const sortBy = allowedSortFields.includes(query.sortBy) ? query.sortBy : defaultSort;
  const sortOrder = String(query.sortOrder || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  return { page, pageSize, offset: (page - 1) * pageSize, sortBy, sortOrder };
}

function audit(req, action, resource, resourceId, detail) {
  const user = req.user || {};
  db.run(
    `INSERT INTO audit_logs (user_id, username, action, resource, resource_id, detail, ip, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      user.id || null,
      user.username || 'system',
      action,
      resource,
      resourceId === undefined || resourceId === null ? null : String(resourceId),
      detail ? JSON.stringify(detail) : null,
      req.ip || req.socket?.remoteAddress || '',
      now()
    ]
  );
}

function maskIdCard(value) {
  if (!value) return value || '';
  const text = String(value);
  if (text.length < 8) return '****';
  return `${text.slice(0, 4)}********${text.slice(-4)}`;
}

function maskBankAccount(value) {
  if (!value) return value || '';
  const text = String(value);
  if (text.length < 5) return '****';
  return `**** **** **** ${text.slice(-4)}`;
}

function toEmployee(row, viewer, options = {}) {
  if (!row) return null;
  const privileged = ['admin', 'hr'].includes(viewer?.role);
  const self = viewer?.employeeId === row.id;
  const output = { ...row };
  if (!privileged) {
    output.id_card = self ? maskIdCard(row.id_card) : undefined;
    output.bank_account = self ? maskBankAccount(row.bank_account) : undefined;
    output.base_salary = undefined;
  }
  if (options.list && !privileged) {
    delete output.address;
    delete output.emergency_contact;
    delete output.emergency_phone;
  }
  return output;
}

function parseCsv(text) {
  const content = String(text || '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];
    const next = content[i + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(cell.trim());
      cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(cell.trim());
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  row.push(cell.trim());
  if (row.some((value) => value !== '')) rows.push(row);
  if (!rows.length) return [];
  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1).map((values, index) => ({
    line: index + 2,
    data: Object.fromEntries(headers.map((header, column) => [header, values[column] ?? '']))
  }));
}

function csvEscape(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(headers, rows) {
  const lines = [headers.map((header) => csvEscape(header.label)).join(',')];
  rows.forEach((row) => lines.push(headers.map((header) => csvEscape(row[header.key])).join(',')));
  return `\uFEFF${lines.join('\r\n')}`;
}

function dateOnly(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function monthOnly(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

function buildUpdate(fields, body, allowed) {
  const values = [];
  const clauses = [];
  for (const field of allowed) {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      clauses.push(`${field} = ?`);
      values.push(body[field]);
    }
  }
  return { clauses, values };
}

module.exports = {
  AppError,
  asyncHandler,
  now,
  requireFields,
  optionalNumber,
  pagination,
  audit,
  maskIdCard,
  maskBankAccount,
  toEmployee,
  parseCsv,
  toCsv,
  dateOnly,
  monthOnly,
  buildUpdate,
  config
};

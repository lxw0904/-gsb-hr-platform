import express from 'express';
import { db } from '../db.js';
import { AppError, asyncHandler, sendSuccess } from '../errors.js';
import { ROLES, requireRoles } from '../middleware.js';
import { hashPassword } from '../security.js';
import { serializeUser } from '../serializers.js';
import { writeAudit } from '../audit.js';
import { normalizePagination, resolveSort, toCsv } from '../utils.js';
import { seedDemoData } from '../seed.js';

export const adminRouter = express.Router();
adminRouter.use(requireRoles(ROLES.ADMIN));

const userSelect = `
  SELECT u.*, e.name AS employee_name, e.employee_no, d.name AS department_name
  FROM users u
  LEFT JOIN employees e ON e.id = u.employee_id
  LEFT JOIN departments d ON d.id = e.department_id
`;

function getUser(id) {
  return db.prepare(`${userSelect} WHERE u.id = ?`).get(Number(id));
}

function validateUserPayload(body, currentId = null) {
  const username = String(body?.username || '').trim();
  const role = String(body?.role || '').toUpperCase();
  const employeeId = body?.employeeId ? Number(body.employeeId) : null;
  const isActive = body?.isActive === undefined ? true : Boolean(body.isActive);
  if (!/^[a-zA-Z][a-zA-Z0-9_.-]{2,31}$/.test(username)) {
    throw new AppError(400, 'VALIDATION_ERROR', '用户名需以字母开头，长度 3-32 位，仅允许字母、数字、点、下划线和短横线');
  }
  if (![ROLES.ADMIN, ROLES.HR, ROLES.EMPLOYEE].includes(role)) throw new AppError(400, 'VALIDATION_ERROR', '用户角色无效');
  if (employeeId && !db.prepare('SELECT id FROM employees WHERE id = ?').get(employeeId)) throw new AppError(400, 'INVALID_EMPLOYEE', '关联员工不存在');
  const usernameOwner = db.prepare('SELECT id FROM users WHERE username = ? AND (? IS NULL OR id <> ?)').get(username, currentId, currentId);
  if (usernameOwner) throw new AppError(409, 'USERNAME_EXISTS', '用户名已存在');
  if (employeeId) {
    const employeeOwner = db.prepare('SELECT id FROM users WHERE employee_id = ? AND (? IS NULL OR id <> ?)').get(employeeId, currentId, currentId);
    if (employeeOwner) throw new AppError(409, 'EMPLOYEE_USER_EXISTS', '该员工已关联其他登录账号');
  }
  return { username, role, employeeId, isActive };
}

function assertAdminRemains(current, nextRole, nextActive) {
  if (current.role !== ROLES.ADMIN || !current.is_active) return;
  if (nextRole === ROLES.ADMIN && nextActive) return;
  const adminCount = db.prepare(`SELECT COUNT(*) AS count FROM users WHERE role = 'ADMIN' AND is_active = 1 AND id <> ?`).get(current.id).count;
  if (adminCount === 0) throw new AppError(409, 'LAST_ADMIN_REQUIRED', '系统必须保留至少一个启用状态的管理员账号');
}

adminRouter.get('/users', asyncHandler(async (req, res) => {
  const conditions = ['1 = 1'];
  const params = [];
  const keyword = String(req.query.q || '').trim();
  if (keyword) {
    conditions.push('(u.username LIKE ? OR e.name LIKE ? OR e.employee_no LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  if (req.query.role) {
    conditions.push('u.role = ?');
    params.push(String(req.query.role).toUpperCase());
  }
  if (req.query.status) {
    conditions.push('u.is_active = ?');
    params.push(req.query.status === 'ACTIVE' ? 1 : 0);
  }
  const { page, pageSize, offset } = normalizePagination(req.query);
  const { sortBy, sortOrder } = resolveSort(req.query, {
    username: 'u.username', role: 'u.role', isActive: 'u.is_active', createdAt: 'u.created_at', lastLoginAt: 'u.last_login_at',
  }, 'username');
  const where = conditions.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) AS count FROM users u LEFT JOIN employees e ON e.id = u.employee_id WHERE ${where}`).get(...params).count;
  const rows = db.prepare(`${userSelect} WHERE ${where} ORDER BY ${sortBy} ${sortOrder}, u.id ASC LIMIT ? OFFSET ?`)
    .all(...params, pageSize, offset);
  return sendSuccess(res, rows.map(serializeUser), { page, pageSize, total, totalPages: Math.ceil(total / pageSize) || 1 });
}));

adminRouter.post('/users', asyncHandler(async (req, res) => {
  const data = validateUserPayload(req.body);
  const password = String(req.body?.password || '');
  if (password.length < 6) throw new AppError(400, 'VALIDATION_ERROR', '初始密码至少 6 位');
  const result = db.prepare(`
    INSERT INTO users (username, password_hash, role, employee_id, is_active) VALUES (?, ?, ?, ?, ?)
  `).run(data.username, hashPassword(password), data.role, data.employeeId, data.isActive ? 1 : 0);
  writeAudit(req, 'CREATE_USER', 'USER', result.lastInsertRowid, { username: data.username, role: data.role, employeeId: data.employeeId, isActive: data.isActive });
  return sendSuccess(res, serializeUser(getUser(result.lastInsertRowid)), undefined, 201);
}));

adminRouter.put('/users/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const current = getUser(id);
  if (!current) throw new AppError(404, 'USER_NOT_FOUND', '用户不存在');
  const data = validateUserPayload(req.body, id);
  if (id === Number(req.user.id) && (data.role !== req.user.role || !data.isActive)) {
    throw new AppError(409, 'SELF_PERMISSION_CHANGE', '不能修改自己的角色或停用自己的账号');
  }
  assertAdminRemains(current, data.role, data.isActive);
  db.prepare(`
    UPDATE users SET username = ?, role = ?, employee_id = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(data.username, data.role, data.employeeId, data.isActive ? 1 : 0, id);
  writeAudit(req, 'UPDATE_USER_PERMISSION', 'USER', id, {
    username: data.username,
    before: { role: current.role, employeeId: current.employee_id, isActive: Boolean(current.is_active) },
    after: { role: data.role, employeeId: data.employeeId, isActive: data.isActive },
  });
  return sendSuccess(res, serializeUser(getUser(id)));
}));

adminRouter.put('/users/:id/password', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const current = getUser(id);
  if (!current) throw new AppError(404, 'USER_NOT_FOUND', '用户不存在');
  const password = String(req.body?.password || '');
  if (password.length < 6) throw new AppError(400, 'VALIDATION_ERROR', '新密码至少 6 位');
  db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(hashPassword(password), id);
  writeAudit(req, 'RESET_USER_PASSWORD', 'USER', id, { username: current.username });
  return sendSuccess(res, null);
}));

adminRouter.delete('/users/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const current = getUser(id);
  if (!current) throw new AppError(404, 'USER_NOT_FOUND', '用户不存在');
  if (id === Number(req.user.id)) throw new AppError(409, 'CANNOT_DELETE_SELF', '不能删除当前登录账号');
  assertAdminRemains(current, ROLES.EMPLOYEE, false);
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  writeAudit(req, 'DELETE_USER', 'USER', id, { username: current.username, role: current.role });
  return sendSuccess(res, null);
}));

adminRouter.get('/audit-logs/export', asyncHandler(async (req, res) => {
  const rows = db.prepare(`
    SELECT id, username, role, action, target_type, target_id, detail, ip, created_at
    FROM audit_logs ORDER BY created_at DESC, id DESC LIMIT 5000
  `).all();
  const csv = toCsv([
    { key: 'id', label: 'ID' }, { key: 'created_at', label: '时间' }, { key: 'username', label: '操作人' },
    { key: 'role', label: '角色' }, { key: 'action', label: '动作' }, { key: 'target_type', label: '对象类型' },
    { key: 'target_id', label: '对象 ID' }, { key: 'detail', label: '详情' }, { key: 'ip', label: 'IP' },
  ], rows);
  writeAudit(req, 'EXPORT_AUDIT_LOGS', 'AUDIT', 'batch', { count: rows.length });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${Date.now()}.csv"`);
  return res.send(csv);
}));

adminRouter.get('/audit-logs', asyncHandler(async (req, res) => {
  const conditions = ['1 = 1'];
  const params = [];
  const keyword = String(req.query.q || '').trim();
  if (keyword) {
    conditions.push('(username LIKE ? OR action LIKE ? OR target_type LIKE ? OR target_id LIKE ? OR detail LIKE ?)');
    const like = `%${keyword}%`;
    params.push(like, like, like, like, like);
  }
  if (req.query.role) {
    conditions.push('role = ?');
    params.push(String(req.query.role).toUpperCase());
  }
  if (req.query.action) {
    conditions.push('action = ?');
    params.push(String(req.query.action).toUpperCase());
  }
  if (req.query.startDate) {
    conditions.push('date(created_at) >= date(?)');
    params.push(String(req.query.startDate));
  }
  if (req.query.endDate) {
    conditions.push('date(created_at) <= date(?)');
    params.push(String(req.query.endDate));
  }
  const { page, pageSize, offset } = normalizePagination(req.query);
  const { sortBy, sortOrder } = resolveSort(req.query, {
    createdAt: 'created_at', username: 'username', action: 'action', targetType: 'target_type',
  }, 'createdAt', 'DESC');
  const where = conditions.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) AS count FROM audit_logs WHERE ${where}`).get(...params).count;
  const rows = db.prepare(`
    SELECT id, user_id, username, role, action, target_type, target_id, detail, ip, created_at
    FROM audit_logs WHERE ${where} ORDER BY ${sortBy} ${sortOrder}, id DESC LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset);
  return sendSuccess(res, rows, { page, pageSize, total, totalPages: Math.ceil(total / pageSize) || 1 });
}));

adminRouter.post('/reset-demo', asyncHandler(async (req, res) => {
  if (req.body?.confirmation !== 'RESET') {
    throw new AppError(400, 'CONFIRMATION_REQUIRED', '请输入 RESET 确认重置演示数据');
  }
  seedDemoData({ force: true });
  const actor = { id: 1, username: 'admin', role: 'ADMIN' };
  writeAudit({ user: actor, ip: req.ip, socket: req.socket }, 'RESET_DEMO_DATA', 'SYSTEM', 'all', { requestedBy: req.user.username });
  return sendSuccess(res, { message: '演示数据已重置，请使用默认账号重新登录' });
}));

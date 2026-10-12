const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../lib/db');
const config = require('../config');
const { AppError, asyncHandler, requireFields, now, audit, pagination } = require('../lib/utils');
const { seedDemoData } = require('../lib/seed');

const router = express.Router();
router.use((req, _res, next) => req.user.role === 'admin' ? next() : next(new AppError(403, 'FORBIDDEN', '仅管理员可以访问系统管理功能')));

router.get('/users', asyncHandler(async (req, res) => {
  const conditions = ['1 = 1'];
  const params = [];
  if (req.query.keyword) {
    conditions.push('(u.username LIKE ? OR e.name LIKE ? OR e.employee_no LIKE ?)');
    const keyword = `%${req.query.keyword}%`;
    params.push(keyword, keyword, keyword);
  }
  if (req.query.role) { conditions.push('u.role = ?'); params.push(req.query.role); }
  if (req.query.status) { conditions.push('u.status = ?'); params.push(req.query.status); }
  const { page, pageSize, offset, sortBy, sortOrder } = pagination(req.query, ['username', 'role', 'status', 'created_at', 'last_login_at'], 'created_at');
  const total = Number(db.get(`SELECT COUNT(*) AS count FROM users u LEFT JOIN employees e ON e.id = u.employee_id WHERE ${conditions.join(' AND ')}`, params).count);
  const rows = db.all(
    `SELECT u.id, u.username, u.role, u.employee_id, u.status, u.last_login_at, u.created_at,
      e.name AS employee_name, e.employee_no
     FROM users u LEFT JOIN employees e ON e.id = u.employee_id
     WHERE ${conditions.join(' AND ')} ORDER BY u.${sortBy} ${sortOrder} LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );
  res.json({ success: true, data: { list: rows, total, page, pageSize } });
}));

router.post('/users', asyncHandler(async (req, res) => {
  requireFields(req.body || {}, ['username', 'password', 'role']);
  if (!['admin', 'hr', 'employee'].includes(req.body.role)) throw new AppError(400, 'INVALID_ROLE', '角色不正确');
  if (String(req.body.password).length < 8) throw new AppError(400, 'WEAK_PASSWORD', '密码至少需要 8 位');
  if (db.get('SELECT id FROM users WHERE username = ?', [String(req.body.username).trim()])) throw new AppError(409, 'DUPLICATE_USERNAME', '用户名已存在');
  if (req.body.employee_id) {
    if (!db.get('SELECT id FROM employees WHERE id = ?', [Number(req.body.employee_id)])) throw new AppError(400, 'INVALID_EMPLOYEE', '绑定员工不存在');
    if (db.get('SELECT id FROM users WHERE employee_id = ?', [Number(req.body.employee_id)])) throw new AppError(409, 'EMPLOYEE_ALREADY_BOUND', '该员工已绑定登录账号');
  }
  const hash = await bcrypt.hash(String(req.body.password), config.bcryptRounds);
  let id;
  db.transaction(() => {
    id = db.run(
      `INSERT INTO users (username, password_hash, role, employee_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'active', ?, ?)`,
      [String(req.body.username).trim(), hash, req.body.role, req.body.employee_id ? Number(req.body.employee_id) : null, now(), now()]
    ).id;
    audit(req, 'CREATE_USER', 'user', id, { username: req.body.username, role: req.body.role, employee_id: req.body.employee_id || null });
  });
  res.status(201).json({ success: true, data: { id }, message: '用户账号已创建' });
}));

router.put('/users/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const user = db.get('SELECT * FROM users WHERE id = ?', [id]);
  if (!user) throw new AppError(404, 'NOT_FOUND', '用户不存在');
  const role = req.body.role || user.role;
  const status = req.body.status || user.status;
  const employeeId = Object.prototype.hasOwnProperty.call(req.body, 'employee_id') ? (req.body.employee_id ? Number(req.body.employee_id) : null) : user.employee_id;
  if (!['admin', 'hr', 'employee'].includes(role)) throw new AppError(400, 'INVALID_ROLE', '角色不正确');
  if (!['active', 'disabled'].includes(status)) throw new AppError(400, 'INVALID_STATUS', '用户状态不正确');
  if (id === req.user.id && (status !== 'active' || role !== 'admin')) throw new AppError(400, 'SELF_PROTECTION', '不能停用自己或移除自己的管理员角色');
  if (user.role === 'admin' && (role !== 'admin' || status !== 'active')) {
    const activeAdmins = Number(db.get(`SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND status = 'active'`).count);
    if (activeAdmins <= 1) throw new AppError(409, 'LAST_ADMIN', '系统必须保留至少一名启用状态的管理员');
  }
  if (employeeId) {
    if (!db.get('SELECT id FROM employees WHERE id = ?', [employeeId])) throw new AppError(400, 'INVALID_EMPLOYEE', '绑定员工不存在');
    const bound = db.get('SELECT id FROM users WHERE employee_id = ? AND id != ?', [employeeId, id]);
    if (bound) throw new AppError(409, 'EMPLOYEE_ALREADY_BOUND', '该员工已绑定其他登录账号');
  }
  db.transaction(() => {
    db.run('UPDATE users SET role = ?, status = ?, employee_id = ?, updated_at = ? WHERE id = ?', [role, status, employeeId, now(), id]);
    audit(req, 'UPDATE_USER', 'user', id, { before: { role: user.role, status: user.status, employee_id: user.employee_id }, after: { role, status, employee_id: employeeId } });
  });
  res.json({ success: true, data: { id }, message: '账号权限已更新' });
}));

router.post('/users/:id/reset-password', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const user = db.get('SELECT * FROM users WHERE id = ?', [id]);
  if (!user) throw new AppError(404, 'NOT_FOUND', '用户不存在');
  requireFields(req.body || {}, ['password']);
  if (String(req.body.password).length < 8) throw new AppError(400, 'WEAK_PASSWORD', '密码至少需要 8 位');
  const hash = await bcrypt.hash(String(req.body.password), config.bcryptRounds);
  db.transaction(() => {
    db.run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [hash, now(), id]);
    audit(req, 'RESET_USER_PASSWORD', 'user', id, { username: user.username });
  });
  res.json({ success: true, data: { id }, message: '密码已重置' });
}));

router.delete('/users/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const user = db.get('SELECT * FROM users WHERE id = ?', [id]);
  if (!user) throw new AppError(404, 'NOT_FOUND', '用户不存在');
  if (id === req.user.id) throw new AppError(400, 'SELF_PROTECTION', '不能删除当前登录账号');
  if (user.role === 'admin') {
    const activeAdmins = Number(db.get(`SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND status = 'active'`).count);
    if (activeAdmins <= 1) throw new AppError(409, 'LAST_ADMIN', '系统必须保留至少一名管理员');
  }
  if (req.body?.confirm !== true) throw new AppError(400, 'CONFIRM_REQUIRED', '删除账号需要二次确认');
  db.transaction(() => {
    audit(req, 'DELETE_USER', 'user', id, { username: user.username, role: user.role });
    db.run('DELETE FROM users WHERE id = ?', [id]);
  });
  res.json({ success: true, data: { id }, message: '用户账号已删除' });
}));

router.get('/audit-logs', asyncHandler(async (req, res) => {
  const conditions = ['1 = 1'];
  const params = [];
  if (req.query.keyword) {
    conditions.push('(a.username LIKE ? OR a.resource LIKE ? OR a.action LIKE ? OR a.detail LIKE ?)');
    const keyword = `%${req.query.keyword}%`;
    params.push(keyword, keyword, keyword, keyword);
  }
  if (req.query.action) { conditions.push('a.action = ?'); params.push(req.query.action); }
  if (req.query.resource) { conditions.push('a.resource = ?'); params.push(req.query.resource); }
  if (req.query.startDate) { conditions.push('date(a.created_at) >= date(?)'); params.push(req.query.startDate); }
  if (req.query.endDate) { conditions.push('date(a.created_at) <= date(?)'); params.push(req.query.endDate); }
  const { page, pageSize, offset, sortBy, sortOrder } = pagination(req.query, ['created_at', 'username', 'action', 'resource'], 'created_at');
  const total = Number(db.get(`SELECT COUNT(*) AS count FROM audit_logs a WHERE ${conditions.join(' AND ')}`, params).count);
  const rows = db.all(
    `SELECT a.*, u.employee_id FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
     WHERE ${conditions.join(' AND ')} ORDER BY a.${sortBy} ${sortOrder} LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );
  res.json({ success: true, data: { list: rows, total, page, pageSize } });
}));

router.post('/reset-demo', asyncHandler(async (req, res) => {
  if (req.body?.confirm !== config.demoResetToken) throw new AppError(400, 'CONFIRM_REQUIRED', `请输入 ${config.demoResetToken} 确认重置演示数据`);
  await seedDemoData(true);
  res.json({ success: true, data: { message: '演示数据已重置，请重新登录' }, message: '演示数据已重置，请重新登录' });
}));

module.exports = router;

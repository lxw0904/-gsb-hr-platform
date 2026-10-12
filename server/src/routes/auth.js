const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../lib/db');
const config = require('../config');
const { AppError, asyncHandler, requireFields, now, audit } = require('../lib/utils');

const router = express.Router();

router.post('/login', asyncHandler(async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) throw new AppError(400, 'VALIDATION_ERROR', '请输入用户名和密码');
  const user = db.get(
    `SELECT u.*, e.name AS employee_name, e.employee_no, e.department_id
     FROM users u LEFT JOIN employees e ON e.id = u.employee_id
     WHERE u.username = ?`,
    [String(username).trim()]
  );
  if (!user || !(await bcrypt.compare(String(password), user.password_hash))) {
    throw new AppError(401, 'INVALID_CREDENTIALS', '用户名或密码错误');
  }
  if (user.status !== 'active') throw new AppError(403, 'ACCOUNT_DISABLED', '账号已被停用，请联系管理员');
  db.run('UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?', [now(), now(), user.id]);
  db.persist();
  req.user = { id: user.id, username: user.username, role: user.role, employeeId: user.employee_id };
  audit(req, 'LOGIN', 'auth', user.id, { username: user.username });
  db.persist();
  const token = jwt.sign(
    { sub: user.id, role: user.role, username: user.username },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
  res.json({
    success: true,
    data: {
      token,
      expiresIn: config.jwtExpiresIn,
      user: { id: user.id, username: user.username, role: user.role, employeeId: user.employee_id, employeeName: user.employee_name }
    }
  });
}));

router.get('/me', asyncHandler(async (req, res) => {
  const employee = req.user.employeeId ? db.get(
    `SELECT e.*, d.name AS department_name, p.name AS position_name
     FROM employees e
     LEFT JOIN departments d ON d.id = e.department_id
     LEFT JOIN positions p ON p.id = e.position_id
     WHERE e.id = ?`,
    [req.user.employeeId]
  ) : null;
  const { toEmployee } = require('../lib/utils');
  res.json({
    success: true,
    data: {
      user: req.user,
      employee: toEmployee(employee, req.user)
    }
  });
}));

router.put('/profile', asyncHandler(async (req, res) => {
  if (!req.user.employeeId) throw new AppError(400, 'NO_EMPLOYEE_PROFILE', '当前账号未绑定员工档案');
  const allowed = ['phone', 'email', 'address', 'emergency_contact', 'emergency_phone'];
  const updates = allowed.filter((field) => Object.prototype.hasOwnProperty.call(req.body || {}, field));
  if (!updates.length) throw new AppError(400, 'VALIDATION_ERROR', '没有可更新的资料字段');
  const values = updates.map((field) => req.body[field]);
  db.transaction(() => {
    db.run(
      `UPDATE employees SET ${updates.map((field) => `${field} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
      [...values, now(), req.user.employeeId]
    );
    audit(req, 'UPDATE_PROFILE', 'employee', req.user.employeeId, { fields: updates });
  });
  res.json({ success: true, data: { message: '个人资料已更新' } });
}));

router.put('/password', asyncHandler(async (req, res) => {
  requireFields(req.body || {}, ['oldPassword', 'newPassword']);
  if (String(req.body.newPassword).length < 8) throw new AppError(400, 'WEAK_PASSWORD', '新密码至少需要 8 位');
  const user = db.get('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
  if (!(await bcrypt.compare(String(req.body.oldPassword), user.password_hash))) {
    throw new AppError(400, 'INVALID_PASSWORD', '原密码不正确');
  }
  const hash = await bcrypt.hash(String(req.body.newPassword), config.bcryptRounds);
  db.transaction(() => {
    db.run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [hash, now(), req.user.id]);
    audit(req, 'CHANGE_PASSWORD', 'user', req.user.id);
  });
  res.json({ success: true, data: { message: '密码已修改，请重新登录' } });
}));

module.exports = router;

import express from 'express';
import { db } from '../db.js';
import { AppError, asyncHandler, sendSuccess } from '../errors.js';
import { verifyPassword } from '../security.js';
import { createToken } from '../middleware.js';
import { writeAudit } from '../audit.js';

export const publicAuthRouter = express.Router();
export const authRouter = express.Router();

publicAuthRouter.post('/login', asyncHandler(async (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  if (!username || !password) throw new AppError(400, 'VALIDATION_ERROR', '请输入用户名和密码');

  const user = db.prepare(`
    SELECT u.*, e.name AS employee_name, e.employee_no
    FROM users u
    LEFT JOIN employees e ON e.id = u.employee_id
    WHERE u.username = ?
  `).get(username);

  if (!user || !verifyPassword(password, user.password_hash)) {
    throw new AppError(401, 'LOGIN_FAILED', '用户名或密码不正确');
  }
  if (!user.is_active) throw new AppError(403, 'USER_DISABLED', '该账号已被停用，请联系管理员');

  db.prepare('UPDATE users SET last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);
  const safeUser = {
    id: user.id,
    username: user.username,
    role: user.role,
    employeeId: user.employee_id,
    employeeName: user.employee_name,
    employeeNo: user.employee_no,
  };
  req.user = safeUser;
  writeAudit(req, 'LOGIN', 'USER', user.id, { username: user.username });
  return sendSuccess(res, { token: createToken(safeUser), user: safeUser });
}));

authRouter.get('/me', asyncHandler(async (req, res) => {
  return sendSuccess(res, req.user);
}));

authRouter.post('/logout', asyncHandler(async (req, res) => {
  writeAudit(req, 'LOGOUT', 'USER', req.user.id, {});
  return sendSuccess(res, null);
}));



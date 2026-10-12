import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { AppError } from './errors.js';
import { db } from './db.js';

export const ROLES = Object.freeze({ ADMIN: 'ADMIN', HR: 'HR', EMPLOYEE: 'EMPLOYEE' });

export function createToken(user) {
  return jwt.sign(
    { sub: String(user.id), role: user.role, username: user.username },
    config.jwtSecret,
    { expiresIn: config.tokenExpiresIn },
  );
}

export function authenticate(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) throw new AppError(401, 'AUTH_REQUIRED', '请先登录后再继续操作');
    const payload = jwt.verify(token, config.jwtSecret);
    const user = db.prepare(`
      SELECT u.id, u.username, u.role, u.employee_id AS employeeId, u.is_active AS isActive,
             e.name AS employeeName, e.employee_no AS employeeNo
      FROM users u
      LEFT JOIN employees e ON e.id = u.employee_id
      WHERE u.id = ? AND u.is_active = 1
    `).get(Number(payload.sub));
    if (!user) throw new AppError(401, 'AUTH_INVALID', '登录状态已失效，请重新登录');
    req.user = user;
    next();
  } catch (error) {
    if (error instanceof AppError) return next(error);
    return next(new AppError(401, 'AUTH_INVALID', '登录状态已失效，请重新登录'));
  }
}

export function requireRoles(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(new AppError(401, 'AUTH_REQUIRED', '请先登录后再继续操作'));
    if (!roles.includes(req.user.role)) {
      return next(new AppError(403, 'FORBIDDEN', '当前账号无权执行此操作'));
    }
    next();
  };
}

export function employeeScope(req) {
  return req.user.role === ROLES.EMPLOYEE ? req.user.employeeId : null;
}

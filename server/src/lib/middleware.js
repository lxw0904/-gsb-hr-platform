const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('./db');
const { AppError } = require('./utils');

function requireAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return next(new AppError(401, 'UNAUTHORIZED', '请先登录后再操作'));
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    const user = db.get(
      `SELECT u.id, u.username, u.role, u.employee_id AS employeeId, u.status, e.name AS employeeName
       FROM users u LEFT JOIN employees e ON e.id = u.employee_id WHERE u.id = ?`,
      [payload.sub]
    );
    if (!user || user.status !== 'active') return next(new AppError(401, 'UNAUTHORIZED', '账号不存在或已被停用'));
    req.user = user;
    return next();
  } catch (_error) {
    return next(new AppError(401, 'TOKEN_EXPIRED', '登录状态已失效，请重新登录'));
  }
}

function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(new AppError(401, 'UNAUTHORIZED', '请先登录'));
    if (!roles.includes(req.user.role)) return next(new AppError(403, 'FORBIDDEN', '当前角色无权访问该功能'));
    return next();
  };
}

function errorHandler(error, _req, res, _next) {
  const status = Number(error.status) || 500;
  const code = error.code || (status === 500 ? 'INTERNAL_ERROR' : 'REQUEST_FAILED');
  const message = status === 500 ? '服务器处理请求时遇到问题，请稍后重试' : error.message;
  if (status >= 500) console.error(error);
  res.status(status).json({
    success: false,
    error: {
      code,
      message,
      ...(error.details ? { details: error.details } : {})
    }
  });
}

function notFoundHandler(_req, _res, next) {
  next(new AppError(404, 'NOT_FOUND', '请求的接口不存在'));
}

module.exports = { requireAuth, requireRole, errorHandler, notFoundHandler };

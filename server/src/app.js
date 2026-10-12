import express from 'express';
import { authenticate } from './middleware.js';
import { AppError, sendError } from './errors.js';
import { publicAuthRouter, authRouter } from './routes/auth.js';
import { dashboardRouter } from './routes/dashboard.js';
import { employeeRouter } from './routes/employees.js';
import { departmentRouter, positionRouter } from './routes/org.js';
import { attendanceRouter } from './routes/attendance.js';
import { leaveRouter } from './routes/leaves.js';
import { payrollRouter } from './routes/payrolls.js';
import { adminRouter } from './routes/admin.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  app.use(express.json({ limit: '2mb' }));

  app.use('/api/auth', publicAuthRouter);
  app.use('/api', authenticate);
  app.use('/api/auth', authRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/employees', employeeRouter);
  app.use('/api/departments', departmentRouter);
  app.use('/api/positions', positionRouter);
  app.use('/api/attendance', attendanceRouter);
  app.use('/api/leaves', leaveRouter);
  app.use('/api/payrolls', payrollRouter);
  app.use('/api/admin', adminRouter);

  app.use('/api', (_req, _res, next) => next(new AppError(404, 'API_NOT_FOUND', '请求的接口不存在')));
  app.use((_req, _res, next) => next(new AppError(404, 'NOT_FOUND', '请求的资源不存在')));

  app.use((error, _req, res, _next) => {
    if (error instanceof SyntaxError && 'body' in error) {
      return sendError(res, 400, 'INVALID_JSON', '请求体不是有效的 JSON');
    }
    if (error instanceof AppError) {
      return sendError(res, error.status, error.code, error.message, error.details);
    }
    if (String(error?.code || '').startsWith('SQLITE_CONSTRAINT')) {
      return sendError(res, 409, 'DATA_CONFLICT', '数据存在关联或唯一性冲突，请刷新后重试');
    }
    console.error('[server-error]', error);
    return sendError(res, 500, 'INTERNAL_ERROR', '服务器处理失败，请稍后重试');
  });

  return app;
}

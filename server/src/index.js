const express = require('express');
const config = require('./config');
const db = require('./lib/db');
const { seedDemoData } = require('./lib/seed');
const { requireAuth, errorHandler, notFoundHandler } = require('./lib/middleware');
const { AppError } = require('./lib/utils');

const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const orgRoutes = require('./routes/org');
const employeeRoutes = require('./routes/employees');
const leaveRoutes = require('./routes/leave');
const attendanceRoutes = require('./routes/attendance');
const payrollRoutes = require('./routes/payroll');
const flowRoutes = require('./routes/flows');
const systemRoutes = require('./routes/system');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false }));

app.get('/api/health', (_req, res) => res.json({ success: true, data: { status: 'ok', database: 'ready' } }));
app.use('/api', (req, _res, next) => {
  if (req.path === '/auth/login') return next();
  return requireAuth(req, _res, next);
});

app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/org', orgRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/payrolls', payrollRoutes);
app.use('/api/approvals', flowRoutes);
app.use('/api/system', systemRoutes);

app.use('/api', notFoundHandler);
app.use((error, req, res, next) => {
  if (error && error.code === 'LIMIT_FILE_SIZE') return errorHandler(new AppError(400, 'FILE_TOO_LARGE', '文件不能超过 5MB'), req, res, next);
  return errorHandler(error, req, res, next);
});

async function start() {
  await db.ready();
  await seedDemoData(false);
  app.listen(config.port, () => {
    console.log(`GSB HR API is running at http://localhost:${config.port}`);
    console.log(`Database: ${config.dbPath}`);
  });
}

if (require.main === module) start().catch((error) => {
  console.error('Failed to start server', error);
  process.exit(1);
});

module.exports = app;

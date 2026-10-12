import express from 'express';
import { db } from '../db.js';
import { AppError, asyncHandler, sendSuccess } from '../errors.js';
import { ROLES, requireRoles } from '../middleware.js';
import { writeAudit } from '../audit.js';
import { normalizePagination, resolveSort, toCsv } from '../utils.js';

export const attendanceRouter = express.Router();

function attendanceSelect() {
  return `
    SELECT a.*, e.name AS employee_name, e.employee_no, d.name AS department_name
    FROM attendance a
    JOIN employees e ON e.id = a.employee_id
    JOIN departments d ON d.id = e.department_id
  `;
}

function parseAttendance(body) {
  const employeeId = Number(body?.employeeId);
  const month = String(body?.month || '').slice(0, 7);
  const workDays = Number(body?.workDays ?? 21.75);
  const actualDays = Number(body?.actualDays ?? 0);
  const lateCount = Number(body?.lateCount ?? 0);
  const absentDays = Number(body?.absentDays ?? 0);
  const overtimeHours = Number(body?.overtimeHours ?? 0);
  const status = String(body?.status || 'NORMAL').toUpperCase();
  const errors = [];
  if (!employeeId) errors.push({ field: 'employeeId', message: '员工不能为空' });
  if (!/^\d{4}-\d{2}$/.test(month)) errors.push({ field: 'month', message: '月份格式应为 YYYY-MM' });
  if ([workDays, actualDays, lateCount, absentDays, overtimeHours].some((value) => !Number.isFinite(value) || value < 0)) {
    errors.push({ field: 'metrics', message: '考勤数值必须为非负数' });
  }
  if (!['NORMAL', 'ATTENTION'].includes(status)) errors.push({ field: 'status', message: '考勤状态无效' });
  if (errors.length) throw new AppError(400, 'VALIDATION_ERROR', '考勤数据校验失败', errors);
  if (!db.prepare('SELECT id FROM employees WHERE id = ?').get(employeeId)) throw new AppError(400, 'INVALID_EMPLOYEE', '员工不存在');
  return { employeeId, month, workDays, actualDays, lateCount, absentDays, overtimeHours, status, remark: String(body?.remark || '').trim() };
}

function buildListQuery(req, paginated = true) {
  const conditions = ['1 = 1'];
  const params = [];
  if (req.user.role === ROLES.EMPLOYEE) {
    conditions.push('a.employee_id = ?');
    params.push(req.user.employeeId);
  } else if (req.query.employeeId) {
    conditions.push('a.employee_id = ?');
    params.push(Number(req.query.employeeId));
  }
  const keyword = String(req.query.q || '').trim();
  if (keyword) {
    conditions.push('(e.name LIKE ? OR e.employee_no LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`);
  }
  if (req.query.departmentId) {
    conditions.push('e.department_id = ?');
    params.push(Number(req.query.departmentId));
  }
  if (req.query.month) {
    conditions.push('a.month = ?');
    params.push(String(req.query.month));
  }
  if (req.query.status) {
    conditions.push('a.status = ?');
    params.push(String(req.query.status).toUpperCase());
  }
  const where = conditions.join(' AND ');
  const pagination = paginated ? normalizePagination(req.query) : null;
  const { sortBy, sortOrder } = resolveSort(req.query, {
    month: 'a.month', employeeName: 'e.name', employeeNo: 'e.employee_no', departmentName: 'd.name', status: 'a.status', lateCount: 'a.late_count',
  }, 'month', 'DESC');
  return { where, params, pagination, sortBy, sortOrder };
}

attendanceRouter.get('/export', asyncHandler(async (req, res) => {
  const { where, params, sortBy, sortOrder } = buildListQuery(req, false);
  const rows = db.prepare(`${attendanceSelect()} WHERE ${where} ORDER BY ${sortBy} ${sortOrder}, a.id DESC`).all(...params);
  const csv = toCsv([
    { key: 'employee_no', label: '工号' }, { key: 'employee_name', label: '姓名' }, { key: 'department_name', label: '部门' },
    { key: 'month', label: '月份' }, { key: 'work_days', label: '应出勤' }, { key: 'actual_days', label: '实出勤' },
    { key: 'late_count', label: '迟到次数' }, { key: 'absent_days', label: '缺勤天数' }, { key: 'overtime_hours', label: '加班小时' },
    { key: 'status', label: '状态' }, { key: 'remark', label: '备注' },
  ], rows);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="attendance-${Date.now()}.csv"`);
  return res.send(csv);
}));

attendanceRouter.get('/', asyncHandler(async (req, res) => {
  const { where, params, pagination, sortBy, sortOrder } = buildListQuery(req);
  const total = db.prepare(`
    SELECT COUNT(*) AS count FROM attendance a JOIN employees e ON e.id = a.employee_id WHERE ${where}
  `).get(...params).count;
  const rows = db.prepare(`${attendanceSelect()} WHERE ${where} ORDER BY ${sortBy} ${sortOrder}, a.id DESC LIMIT ? OFFSET ?`)
    .all(...params, pagination.pageSize, pagination.offset);
  return sendSuccess(res, rows, {
    page: pagination.page, pageSize: pagination.pageSize, total, totalPages: Math.ceil(total / pagination.pageSize) || 1,
  });
}));

attendanceRouter.post('/', requireRoles(ROLES.ADMIN, ROLES.HR), asyncHandler(async (req, res) => {
  const data = parseAttendance(req.body);
  if (db.prepare('SELECT id FROM attendance WHERE employee_id = ? AND month = ?').get(data.employeeId, data.month)) {
    throw new AppError(409, 'ATTENDANCE_EXISTS', '该员工当月考勤记录已存在，请直接编辑');
  }
  const result = db.prepare(`
    INSERT INTO attendance (employee_id, month, work_days, actual_days, late_count, absent_days, overtime_hours, status, remark)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(data.employeeId, data.month, data.workDays, data.actualDays, data.lateCount, data.absentDays, data.overtimeHours, data.status, data.remark);
  writeAudit(req, 'CREATE_ATTENDANCE', 'ATTENDANCE', result.lastInsertRowid, data);
  const row = db.prepare(`${attendanceSelect()} WHERE a.id = ?`).get(result.lastInsertRowid);
  return sendSuccess(res, row, undefined, 201);
}));

attendanceRouter.put('/:id', requireRoles(ROLES.ADMIN, ROLES.HR), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const before = db.prepare('SELECT * FROM attendance WHERE id = ?').get(id);
  if (!before) throw new AppError(404, 'ATTENDANCE_NOT_FOUND', '考勤记录不存在');
  const data = parseAttendance({ ...req.body, employeeId: req.body.employeeId || before.employee_id });
  const duplicate = db.prepare('SELECT id FROM attendance WHERE employee_id = ? AND month = ? AND id <> ?').get(data.employeeId, data.month, id);
  if (duplicate) throw new AppError(409, 'ATTENDANCE_EXISTS', '该员工当月已存在其他考勤记录');
  db.prepare(`
    UPDATE attendance SET employee_id = ?, month = ?, work_days = ?, actual_days = ?, late_count = ?,
      absent_days = ?, overtime_hours = ?, status = ?, remark = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(data.employeeId, data.month, data.workDays, data.actualDays, data.lateCount, data.absentDays, data.overtimeHours, data.status, data.remark, id);
  writeAudit(req, 'UPDATE_ATTENDANCE', 'ATTENDANCE', id, { before, after: data });
  return sendSuccess(res, db.prepare(`${attendanceSelect()} WHERE a.id = ?`).get(id));
}));

attendanceRouter.delete('/:id', requireRoles(ROLES.ADMIN, ROLES.HR), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM attendance WHERE id = ?').get(id);
  if (!row) throw new AppError(404, 'ATTENDANCE_NOT_FOUND', '考勤记录不存在');
  db.prepare('DELETE FROM attendance WHERE id = ?').run(id);
  writeAudit(req, 'DELETE_ATTENDANCE', 'ATTENDANCE', id, { employeeId: row.employee_id, month: row.month });
  return sendSuccess(res, null);
}));

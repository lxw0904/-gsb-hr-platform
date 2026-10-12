import express from 'express';
import { db } from '../db.js';
import { AppError, asyncHandler, sendSuccess } from '../errors.js';
import { ROLES, requireRoles } from '../middleware.js';
import { assertTransition, PAYROLL_TRANSITIONS } from '../state.js';
import { writeAudit } from '../audit.js';
import { normalizePagination, resolveSort, toCsv } from '../utils.js';

export const payrollRouter = express.Router();

const payrollSelect = `
  SELECT p.*, e.name AS employee_name, e.employee_no, d.name AS department_name
  FROM payrolls p
  JOIN employees e ON e.id = p.employee_id
  JOIN departments d ON d.id = e.department_id
`;

function getPayroll(id) {
  return db.prepare(`${payrollSelect} WHERE p.id = ?`).get(Number(id));
}

function buildFilters(req, paginated = true) {
  const conditions = ['1 = 1'];
  const params = [];
  if (req.user.role === ROLES.EMPLOYEE) {
    conditions.push('p.employee_id = ?');
    params.push(req.user.employeeId);
  } else if (req.query.employeeId) {
    conditions.push('p.employee_id = ?');
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
    conditions.push('p.month = ?');
    params.push(String(req.query.month));
  }
  if (req.query.status) {
    conditions.push('p.status = ?');
    params.push(String(req.query.status).toUpperCase());
  }
  const pagination = paginated ? normalizePagination(req.query) : null;
  const { sortBy, sortOrder } = resolveSort(req.query, {
    month: 'p.month', employeeName: 'e.name', employeeNo: 'e.employee_no', departmentName: 'd.name',
    baseSalary: 'p.base_salary', netSalary: 'p.net_salary', status: 'p.status',
  }, 'month', 'DESC');
  return { where: conditions.join(' AND '), params, pagination, sortBy, sortOrder };
}

function parsePayroll(body, employeeId) {
  const month = String(body?.month || '').slice(0, 7);
  const values = {
    baseSalary: Number(body?.baseSalary ?? 0),
    performanceBonus: Number(body?.performanceBonus ?? 0),
    socialSecurity: Number(body?.socialSecurity ?? 0),
    tax: Number(body?.tax ?? 0),
    deduction: Number(body?.deduction ?? 0),
  };
  if (!/^\d{4}-\d{2}$/.test(month)) throw new AppError(400, 'VALIDATION_ERROR', '工资月份格式应为 YYYY-MM');
  for (const [field, value] of Object.entries(values)) {
    if (!Number.isFinite(value) || value < 0) throw new AppError(400, 'VALIDATION_ERROR', `${field} 必须为非负数`);
  }
  if (!db.prepare('SELECT id FROM employees WHERE id = ?').get(employeeId)) throw new AppError(400, 'INVALID_EMPLOYEE', '员工不存在');
  const netSalary = values.baseSalary + values.performanceBonus - values.socialSecurity - values.tax - values.deduction;
  return { employeeId, month, ...values, netSalary };
}

payrollRouter.get('/export', requireRoles(ROLES.ADMIN, ROLES.HR), asyncHandler(async (req, res) => {
  const { where, params, sortBy, sortOrder } = buildFilters(req, false);
  const rows = db.prepare(`${payrollSelect} WHERE ${where} ORDER BY ${sortBy} ${sortOrder}`).all(...params);
  const csv = toCsv([
    { key: 'employee_no', label: '工号' }, { key: 'employee_name', label: '姓名' }, { key: 'department_name', label: '部门' },
    { key: 'month', label: '月份' }, { key: 'base_salary', label: '基本工资' }, { key: 'performance_bonus', label: '绩效奖金' },
    { key: 'social_security', label: '社保公积金' }, { key: 'tax', label: '个税' }, { key: 'deduction', label: '其他扣款' },
    { key: 'net_salary', label: '实发工资' }, { key: 'status', label: '状态' },
  ], rows);
  writeAudit(req, 'EXPORT_PAYROLLS', 'PAYROLL', 'batch', { count: rows.length, filters: req.query });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="payrolls-${Date.now()}.csv"`);
  return res.send(csv);
}));

payrollRouter.get('/', asyncHandler(async (req, res) => {
  const { where, params, pagination, sortBy, sortOrder } = buildFilters(req);
  const total = db.prepare(`
    SELECT COUNT(*) AS count FROM payrolls p JOIN employees e ON e.id = p.employee_id WHERE ${where}
  `).get(...params).count;
  const rows = db.prepare(`${payrollSelect} WHERE ${where} ORDER BY ${sortBy} ${sortOrder}, p.id DESC LIMIT ? OFFSET ?`)
    .all(...params, pagination.pageSize, pagination.offset);
  return sendSuccess(res, rows, {
    page: pagination.page, pageSize: pagination.pageSize, total, totalPages: Math.ceil(total / pagination.pageSize) || 1,
  });
}));

payrollRouter.post('/generate', requireRoles(ROLES.ADMIN, ROLES.HR), asyncHandler(async (req, res) => {
  const month = String(req.body?.month || '').slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) throw new AppError(400, 'VALIDATION_ERROR', '请选择有效的工资月份');
  const employees = db.prepare(`
    SELECT id, base_salary, hire_date, leave_date FROM employees
    WHERE status = 'ACTIVE' OR (leave_date IS NOT NULL AND substr(leave_date, 1, 7) >= ?)
  `).all(month);
  if (!employees.length) throw new AppError(409, 'NO_ELIGIBLE_EMPLOYEES', '当前月份没有可生成工资单的员工');
  const existing = db.prepare('SELECT employee_id FROM payrolls WHERE month = ?').all(month).map((row) => row.employee_id);
  const existingSet = new Set(existing.map(Number));
  let generated = 0;
  db.exec('BEGIN IMMEDIATE');
  try {
    const insert = db.prepare(`
      INSERT INTO payrolls (
        employee_id, month, base_salary, performance_bonus, social_security, tax, deduction, net_salary, status, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, 'DRAFT', ?)
    `);
    for (const employee of employees) {
      if (existingSet.has(Number(employee.id))) continue;
      const baseSalary = Number(employee.base_salary || 0);
      const performanceBonus = Math.round(baseSalary * 0.1);
      const socialSecurity = Math.round(baseSalary * 0.105);
      const taxable = Math.max(0, baseSalary + performanceBonus - socialSecurity - 5000);
      const tax = Math.round(taxable * 0.03);
      const netSalary = baseSalary + performanceBonus - socialSecurity - tax;
      insert.run(employee.id, month, baseSalary, performanceBonus, socialSecurity, tax, netSalary, req.user.id);
      generated += 1;
    }
    writeAudit(req, 'GENERATE_PAYROLLS', 'PAYROLL', month, { month, generated, skipped: existing.length });
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return sendSuccess(res, { month, generated, skipped: existing.length });
}));

payrollRouter.put('/:id', requireRoles(ROLES.ADMIN, ROLES.HR), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const current = getPayroll(id);
  if (!current) throw new AppError(404, 'PAYROLL_NOT_FOUND', '工资单不存在');
  if (current.status !== 'DRAFT') throw new AppError(409, 'PAYROLL_LOCKED', '只有草稿状态的工资单可以修改，已确认或已发放工资单禁止修改');
  const data = parsePayroll(req.body, req.body?.employeeId || current.employee_id);
  const duplicate = db.prepare('SELECT id FROM payrolls WHERE employee_id = ? AND month = ? AND id <> ?').get(data.employeeId, data.month, id);
  if (duplicate) throw new AppError(409, 'PAYROLL_EXISTS', '该员工当月工资单已存在');
  db.prepare(`
    UPDATE payrolls SET employee_id = ?, month = ?, base_salary = ?, performance_bonus = ?, social_security = ?,
      tax = ?, deduction = ?, net_salary = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(data.employeeId, data.month, data.baseSalary, data.performanceBonus, data.socialSecurity, data.tax, data.deduction, data.netSalary, id);
  writeAudit(req, 'UPDATE_PAYROLL', 'PAYROLL', id, { employeeId: data.employeeId, month: data.month, before: current, after: data });
  return sendSuccess(res, getPayroll(id));
}));

payrollRouter.post('/:id/confirm', requireRoles(ROLES.ADMIN, ROLES.HR), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const current = getPayroll(id);
  if (!current) throw new AppError(404, 'PAYROLL_NOT_FOUND', '工资单不存在');
  assertTransition(PAYROLL_TRANSITIONS, current.status, 'CONFIRMED', '工资单状态');
  db.prepare(`UPDATE payrolls SET status = 'CONFIRMED', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id);
  writeAudit(req, 'CONFIRM_PAYROLL', 'PAYROLL', id, { employeeId: current.employee_id, month: current.month, netSalary: current.net_salary });
  return sendSuccess(res, getPayroll(id));
}));

payrollRouter.post('/:id/paid', requireRoles(ROLES.ADMIN, ROLES.HR), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const current = getPayroll(id);
  if (!current) throw new AppError(404, 'PAYROLL_NOT_FOUND', '工资单不存在');
  assertTransition(PAYROLL_TRANSITIONS, current.status, 'PAID', '工资单状态');
  db.prepare(`UPDATE payrolls SET status = 'PAID', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id);
  writeAudit(req, 'PAY_PAYROLL', 'PAYROLL', id, { employeeId: current.employee_id, month: current.month, netSalary: current.net_salary });
  return sendSuccess(res, getPayroll(id));
}));

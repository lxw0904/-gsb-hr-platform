const express = require('express');
const db = require('../lib/db');
const { AppError, asyncHandler, requireFields, now, audit, pagination } = require('../lib/utils');
const { calculatePayroll } = require('../lib/seed');

const router = express.Router();

function queryParts(req) {
  const conditions = ['1 = 1'];
  const params = [];
  if (req.user.role === 'employee') {
    conditions.push('p.employee_id = ?');
    params.push(req.user.employeeId);
    conditions.push(`p.status = 'issued'`);
  } else if (req.query.departmentId) {
    conditions.push('e.department_id = ?');
    params.push(Number(req.query.departmentId));
  }
  if (req.query.month) { conditions.push('p.month = ?'); params.push(req.query.month); }
  if (req.query.status && req.user.role !== 'employee') { conditions.push('p.status = ?'); params.push(req.query.status); }
  if (req.query.keyword) {
    conditions.push('(e.name LIKE ? OR e.employee_no LIKE ?)');
    const keyword = `%${req.query.keyword}%`;
    params.push(keyword, keyword);
  }
  return { where: conditions.join(' AND '), params };
}

router.get('/', asyncHandler(async (req, res) => {
  const { where, params } = queryParts(req);
  const { page, pageSize, offset, sortBy, sortOrder } = pagination(req.query, ['month', 'employee_name', 'net_salary', 'status'], 'month');
  const sortColumn = sortBy === 'employee_name' ? 'e.name' : `p.${sortBy}`;
  const total = Number(db.get(`SELECT COUNT(*) AS count FROM payrolls p JOIN employees e ON e.id = p.employee_id WHERE ${where}`, params).count);
  const rows = db.all(
    `SELECT p.*, e.name AS employee_name, e.employee_no, d.name AS department_name, pn.name AS position_name
     FROM payrolls p JOIN employees e ON e.id = p.employee_id
     LEFT JOIN departments d ON d.id = e.department_id
     LEFT JOIN positions pn ON pn.id = e.position_id
     WHERE ${where} ORDER BY ${sortColumn} ${sortOrder} LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );
  res.json({ success: true, data: { list: rows, total, page, pageSize } });
}));

router.post('/generate', asyncHandler(async (req, res) => {
  if (!['admin', 'hr'].includes(req.user.role)) throw new AppError(403, 'FORBIDDEN', '当前角色无权生成工资单');
  requireFields(req.body || {}, ['month']);
  if (!/^\d{4}-\d{2}$/.test(req.body.month)) throw new AppError(400, 'VALIDATION_ERROR', '工资月份格式应为 YYYY-MM');
  const conditions = [`employment_status IN ('active', 'probation', 'leave')`];
  const params = [];
  if (req.body.departmentId) {
    conditions.push('department_id = ?');
    params.push(Number(req.body.departmentId));
  }
  const employees = db.all(`SELECT * FROM employees WHERE ${conditions.join(' AND ')} ORDER BY employee_no`, params);
  const created = [];
  db.transaction(() => {
    employees.forEach((employee) => {
      if (db.get('SELECT id FROM payrolls WHERE employee_id = ? AND month = ?', [employee.id, req.body.month])) return;
      const values = calculatePayroll(employee.base_salary, 1);
      const id = db.run(
        `INSERT INTO payrolls (
          employee_id, month, base_salary, performance_bonus, allowance, social_insurance,
          housing_fund, tax, net_salary, status, generated_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)`,
        [employee.id, req.body.month, employee.base_salary, values.performance, values.allowance, values.social,
          values.fund, values.tax, values.net, req.user.id, now(), now()]
      ).id;
      created.push(id);
    });
    audit(req, 'GENERATE_PAYROLL', 'payroll', req.body.month, { month: req.body.month, departmentId: req.body.departmentId || null, created: created.length, skipped: employees.length - created.length });
  });
  res.json({ success: true, data: { created: created.length, skipped: employees.length - created.length }, message: `已生成 ${created.length} 条工资单，跳过 ${employees.length - created.length} 条已有记录` });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  if (!['admin', 'hr'].includes(req.user.role)) throw new AppError(403, 'FORBIDDEN', '员工不能修改工资单');
  const id = Number(req.params.id);
  const payroll = db.get('SELECT * FROM payrolls WHERE id = ?', [id]);
  if (!payroll) throw new AppError(404, 'NOT_FOUND', '工资单不存在');
  if (payroll.status !== 'draft') throw new AppError(409, 'INVALID_STATE', '已发放工资单不可修改');
  if (req.body.confirm !== true) throw new AppError(400, 'CONFIRM_REQUIRED', '修改薪资属于敏感操作，请二次确认');
  const numericFields = ['base_salary', 'performance_bonus', 'allowance', 'social_insurance', 'housing_fund'];
  const values = {};
  numericFields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(req.body, field)) {
      const value = Number(req.body[field]);
      if (!Number.isFinite(value) || value < 0) throw new AppError(400, 'VALIDATION_ERROR', `${field} 必须为非负数字`);
      values[field] = value;
    }
  });
  const base = values.base_salary ?? Number(payroll.base_salary);
  const performance = values.performance_bonus ?? Number(payroll.performance_bonus);
  const allowance = values.allowance ?? Number(payroll.allowance);
  const social = values.social_insurance ?? Number(payroll.social_insurance);
  const fund = values.housing_fund ?? Number(payroll.housing_fund);
  const taxable = Math.max(0, base + performance + allowance - social - fund - 5000);
  const tax = Math.round(taxable * 0.08 * 100) / 100;
  const net = Math.round((base + performance + allowance - social - fund - tax) * 100) / 100;
  db.transaction(() => {
    db.run(
      `UPDATE payrolls SET base_salary = ?, performance_bonus = ?, allowance = ?, social_insurance = ?, housing_fund = ?, tax = ?, net_salary = ?, updated_at = ? WHERE id = ? AND status = 'draft'`,
      [base, performance, allowance, social, fund, tax, net, now(), id]
    );
    audit(req, 'UPDATE_PAYROLL', 'payroll', id, { employee_id: payroll.employee_id, month: payroll.month, before: payroll, after: { ...values, tax, net_salary: net } });
  });
  res.json({ success: true, data: { id, tax, net_salary: net }, message: '工资单已更新' });
}));

router.post('/:id/issue', asyncHandler(async (req, res) => {
  if (!['admin', 'hr'].includes(req.user.role)) throw new AppError(403, 'FORBIDDEN', '当前角色无权发放工资单');
  const id = Number(req.params.id);
  const payroll = db.get('SELECT * FROM payrolls WHERE id = ?', [id]);
  if (!payroll) throw new AppError(404, 'NOT_FOUND', '工资单不存在');
  if (payroll.status !== 'draft') throw new AppError(409, 'INVALID_STATE', '只有草稿工资单可以发放');
  db.transaction(() => {
    db.run(`UPDATE payrolls SET status = 'issued', updated_at = ? WHERE id = ? AND status = 'draft'`, [now(), id]);
    audit(req, 'ISSUE_PAYROLL', 'payroll', id, { employee_id: payroll.employee_id, month: payroll.month, from: 'draft', to: 'issued' });
  });
  res.json({ success: true, data: { id, status: 'issued' }, message: '工资单已发放' });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  if (!['admin', 'hr'].includes(req.user.role)) throw new AppError(403, 'FORBIDDEN', '当前角色无权删除工资单');
  const id = Number(req.params.id);
  const payroll = db.get('SELECT * FROM payrolls WHERE id = ?', [id]);
  if (!payroll) throw new AppError(404, 'NOT_FOUND', '工资单不存在');
  if (payroll.status !== 'draft') throw new AppError(409, 'INVALID_STATE', '已发放工资单不可删除');
  if (req.body?.confirm !== true) throw new AppError(400, 'CONFIRM_REQUIRED', '删除工资单需要二次确认');
  db.transaction(() => {
    db.run('DELETE FROM payrolls WHERE id = ? AND status = ?', [id, 'draft']);
    audit(req, 'DELETE_PAYROLL', 'payroll', id, payroll);
  });
  res.json({ success: true, data: { id }, message: '工资草稿已删除' });
}));

module.exports = router;

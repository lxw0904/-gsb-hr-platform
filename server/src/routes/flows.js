const express = require('express');
const db = require('../lib/db');
const { AppError, asyncHandler, requireFields, now, audit, pagination } = require('../lib/utils');
const { requireRole } = require('../lib/middleware');

const router = express.Router();

function flowQuery(req) {
  const conditions = ['1 = 1'];
  const params = [];
  if (req.user.role === 'employee') {
    conditions.push('f.employee_id = ?');
    params.push(req.user.employeeId);
  } else if (req.query.departmentId) {
    conditions.push('e.department_id = ?');
    params.push(Number(req.query.departmentId));
  }
  if (req.query.type) {
    conditions.push('f.type = ?');
    params.push(req.query.type);
  }
  if (req.query.status) {
    conditions.push('f.status = ?');
    params.push(req.query.status);
  }
  if (req.query.keyword) {
    conditions.push('(e.name LIKE ? OR e.employee_no LIKE ? OR f.reason LIKE ?)');
    const keyword = `%${req.query.keyword}%`;
    params.push(keyword, keyword, keyword);
  }
  return { where: conditions.join(' AND '), params };
}

router.get('/flows', asyncHandler(async (req, res) => {
  const { where, params } = flowQuery(req);
  const { page, pageSize, offset, sortBy, sortOrder } = pagination(req.query, ['created_at', 'effective_date', 'status', 'employee_name'], 'created_at');
  const sortColumn = sortBy === 'employee_name' ? 'e.name' : `f.${sortBy}`;
  const total = Number(db.get(`SELECT COUNT(*) AS count FROM employee_flows f JOIN employees e ON e.id = f.employee_id WHERE ${where}`, params).count);
  const rows = db.all(
    `SELECT f.*, e.name AS employee_name, e.employee_no,
      fd.name AS from_department_name, td.name AS to_department_name,
      fp.name AS from_position_name, tp.name AS to_position_name,
      su.username AS submitter_name, au.username AS approver_name
     FROM employee_flows f
     JOIN employees e ON e.id = f.employee_id
     LEFT JOIN departments fd ON fd.id = f.from_department_id
     LEFT JOIN departments td ON td.id = f.to_department_id
     LEFT JOIN positions fp ON fp.id = f.from_position_id
     LEFT JOIN positions tp ON tp.id = f.to_position_id
     LEFT JOIN users su ON su.id = f.submitted_by
     LEFT JOIN users au ON au.id = f.approved_by
     WHERE ${where} ORDER BY ${sortColumn} ${sortOrder} LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );
  res.json({ success: true, data: { list: rows, total, page, pageSize } });
}));

router.post('/flows', requireRole('admin', 'hr'), asyncHandler(async (req, res) => {
  requireFields(req.body || {}, ['employee_id', 'type', 'effective_date', 'reason']);
  if (!['transfer', 'regularization'].includes(req.body.type)) throw new AppError(400, 'INVALID_FLOW_TYPE', '流程类型不正确');
  const employee = db.get('SELECT * FROM employees WHERE id = ?', [Number(req.body.employee_id)]);
  if (!employee) throw new AppError(404, 'NOT_FOUND', '员工不存在');
  if (employee.employment_status === 'terminated') throw new AppError(409, 'INVALID_STATE', '离职员工不能发起该流程');
  let targetDepartmentId = null;
  let targetPositionId = null;
  if (req.body.type === 'transfer') {
    requireFields(req.body, ['to_department_id', 'to_position_id']);
    targetDepartmentId = Number(req.body.to_department_id);
    targetPositionId = Number(req.body.to_position_id);
    const position = db.get('SELECT id, department_id FROM positions WHERE id = ?', [targetPositionId]);
    if (!position) throw new AppError(400, 'INVALID_POSITION', '目标职位不存在');
    if (Number(position.department_id) !== targetDepartmentId) throw new AppError(400, 'POSITION_MISMATCH', '目标职位与目标部门不匹配');
    if (employee.department_id === targetDepartmentId && employee.position_id === targetPositionId) throw new AppError(400, 'NO_CHANGE', '目标岗位与当前岗位相同');
  }
  let id;
  db.transaction(() => {
    id = db.run(
      `INSERT INTO employee_flows (
        employee_id, type, status, from_department_id, to_department_id, from_position_id, to_position_id,
        effective_date, reason, submitted_by, created_at, updated_at
      ) VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [employee.id, req.body.type, employee.department_id, targetDepartmentId, employee.position_id, targetPositionId,
        req.body.effective_date, String(req.body.reason).trim(), req.user.id, now(), now()]
    ).id;
    audit(req, req.body.type === 'transfer' ? 'SUBMIT_TRANSFER' : 'SUBMIT_REGULARIZATION', 'employee_flow', id, req.body);
  });
  res.status(201).json({ success: true, data: { id, status: 'pending' }, message: '流程已提交审批' });
}));

router.post('/flows/:id/decision', requireRole('admin', 'hr'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const flow = db.get('SELECT * FROM employee_flows WHERE id = ?', [id]);
  if (!flow) throw new AppError(404, 'NOT_FOUND', '审批流程不存在');
  if (flow.status !== 'pending') throw new AppError(409, 'INVALID_STATE', '只有待审批流程可以处理');
  if (!['approve', 'reject'].includes(req.body?.decision)) throw new AppError(400, 'VALIDATION_ERROR', '审批结果不正确');
  const nextStatus = req.body.decision === 'approve' ? 'approved' : 'rejected';
  db.transaction(() => {
    if (nextStatus === 'approved') {
      if (flow.type === 'transfer') {
        db.run('UPDATE employees SET department_id = ?, position_id = ?, updated_at = ? WHERE id = ?', [flow.to_department_id, flow.to_position_id, now(), flow.employee_id]);
      } else {
        db.run(`UPDATE employees SET employment_status = 'active', probation_end_date = NULL, updated_at = ? WHERE id = ?`, [now(), flow.employee_id]);
      }
    }
    db.run(
      'UPDATE employee_flows SET status = ?, approved_by = ?, comment = ?, updated_at = ? WHERE id = ? AND status = ?',
      [nextStatus, req.user.id, req.body.comment || '', now(), id, 'pending']
    );
    audit(req, nextStatus === 'approved' ? 'APPROVE_EMPLOYEE_FLOW' : 'REJECT_EMPLOYEE_FLOW', 'employee_flow', id,
      { employee_id: flow.employee_id, type: flow.type, from: 'pending', to: nextStatus, comment: req.body.comment || '' });
  });
  res.json({ success: true, data: { id, status: nextStatus }, message: nextStatus === 'approved' ? '审批已通过并完成员工档案更新' : '审批已驳回' });
}));

router.get('/salary-adjustments', requireRole('admin', 'hr'), asyncHandler(async (req, res) => {
  const conditions = ['1 = 1'];
  const params = [];
  if (req.query.status) { conditions.push('s.status = ?'); params.push(req.query.status); }
  if (req.query.departmentId) { conditions.push('e.department_id = ?'); params.push(Number(req.query.departmentId)); }
  if (req.query.keyword) {
    conditions.push('(e.name LIKE ? OR e.employee_no LIKE ? OR s.reason LIKE ?)');
    const keyword = `%${req.query.keyword}%`;
    params.push(keyword, keyword, keyword);
  }
  const { page, pageSize, offset, sortBy, sortOrder } = pagination(req.query, ['created_at', 'effective_date', 'status', 'employee_name'], 'created_at');
  const sortColumn = sortBy === 'employee_name' ? 'e.name' : `s.${sortBy}`;
  const total = Number(db.get(`SELECT COUNT(*) AS count FROM salary_adjustments s JOIN employees e ON e.id = s.employee_id WHERE ${conditions.join(' AND ')}`, params).count);
  const rows = db.all(
    `SELECT s.*, e.name AS employee_name, e.employee_no, d.name AS department_name,
      su.username AS submitter_name, au.username AS approver_name
     FROM salary_adjustments s JOIN employees e ON e.id = s.employee_id
     LEFT JOIN departments d ON d.id = e.department_id
     LEFT JOIN users su ON su.id = s.submitted_by
     LEFT JOIN users au ON au.id = s.approved_by
     WHERE ${conditions.join(' AND ')} ORDER BY ${sortColumn} ${sortOrder} LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );
  res.json({ success: true, data: { list: rows, total, page, pageSize } });
}));

router.post('/salary-adjustments', requireRole('admin', 'hr'), asyncHandler(async (req, res) => {
  requireFields(req.body || {}, ['employee_id', 'new_salary', 'effective_date', 'reason']);
  const employee = db.get('SELECT * FROM employees WHERE id = ?', [Number(req.body.employee_id)]);
  if (!employee) throw new AppError(404, 'NOT_FOUND', '员工不存在');
  const newSalary = Number(req.body.new_salary);
  if (!Number.isFinite(newSalary) || newSalary < 0) throw new AppError(400, 'VALIDATION_ERROR', '调整后工资必须为非负数字');
  if (newSalary === Number(employee.base_salary)) throw new AppError(400, 'NO_CHANGE', '调整后工资与当前工资相同');
  let id;
  db.transaction(() => {
    id = db.run(
      `INSERT INTO salary_adjustments (employee_id, old_salary, new_salary, effective_date, reason, status, submitted_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
      [employee.id, employee.base_salary, newSalary, req.body.effective_date, String(req.body.reason).trim(), req.user.id, now(), now()]
    ).id;
    audit(req, 'SUBMIT_SALARY_ADJUSTMENT', 'salary_adjustment', id, { employee_id: employee.id, old_salary: employee.base_salary, new_salary: newSalary, effective_date: req.body.effective_date });
  });
  res.status(201).json({ success: true, data: { id, status: 'pending' }, message: '调薪申请已提交审批' });
}));

router.post('/salary-adjustments/:id/decision', requireRole('admin', 'hr'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const adjustment = db.get('SELECT * FROM salary_adjustments WHERE id = ?', [id]);
  if (!adjustment) throw new AppError(404, 'NOT_FOUND', '调薪申请不存在');
  if (adjustment.status !== 'pending') throw new AppError(409, 'INVALID_STATE', '只有待审批调薪可以处理');
  if (!['approve', 'reject'].includes(req.body?.decision)) throw new AppError(400, 'VALIDATION_ERROR', '审批结果不正确');
  if (req.body.decision === 'approve' && req.body.confirm !== true) throw new AppError(400, 'CONFIRM_REQUIRED', '调薪属于敏感操作，请二次确认');
  const nextStatus = req.body.decision === 'approve' ? 'approved' : 'rejected';
  db.transaction(() => {
    if (nextStatus === 'approved') {
      db.run('UPDATE employees SET base_salary = ?, updated_at = ? WHERE id = ?', [adjustment.new_salary, now(), adjustment.employee_id]);
    }
    db.run(
      'UPDATE salary_adjustments SET status = ?, approved_by = ?, comment = ?, updated_at = ? WHERE id = ? AND status = ?',
      [nextStatus, req.user.id, req.body.comment || '', now(), id, 'pending']
    );
    audit(req, nextStatus === 'approved' ? 'APPROVE_SALARY_ADJUSTMENT' : 'REJECT_SALARY_ADJUSTMENT', 'salary_adjustment', id,
      { employee_id: adjustment.employee_id, old_salary: adjustment.old_salary, new_salary: adjustment.new_salary, from: 'pending', to: nextStatus, comment: req.body.comment || '' });
  });
  res.json({ success: true, data: { id, status: nextStatus }, message: nextStatus === 'approved' ? '调薪已通过并更新员工工资' : '调薪已驳回' });
}));

module.exports = router;

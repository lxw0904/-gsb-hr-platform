const express = require('express');
const db = require('../lib/db');
const { AppError, asyncHandler, requireFields, now, audit, pagination } = require('../lib/utils');

const router = express.Router();

function whereFor(req) {
  const conditions = ['1 = 1'];
  const params = [];
  if (req.user.role === 'employee') {
    conditions.push('a.employee_id = ?');
    params.push(req.user.employeeId);
  } else if (req.query.departmentId) {
    conditions.push('e.department_id = ?');
    params.push(Number(req.query.departmentId));
  }
  if (req.query.month) {
    conditions.push('substr(a.work_date, 1, 7) = ?');
    params.push(req.query.month);
  }
  if (req.query.status) {
    conditions.push('a.status = ?');
    params.push(req.query.status);
  }
  if (req.query.keyword) {
    conditions.push('(e.name LIKE ? OR e.employee_no LIKE ? OR a.remark LIKE ?)');
    const keyword = `%${req.query.keyword}%`;
    params.push(keyword, keyword, keyword);
  }
  return { where: conditions.join(' AND '), params };
}

router.get('/summary', asyncHandler(async (req, res) => {
  const month = req.query.month || new Date().toISOString().slice(0, 7);
  const conditions = ['substr(a.work_date, 1, 7) = ?'];
  const params = [month];
  if (req.user.role === 'employee') {
    conditions.push('a.employee_id = ?');
    params.push(req.user.employeeId);
  } else if (req.query.departmentId) {
    conditions.push('e.department_id = ?');
    params.push(Number(req.query.departmentId));
  }
  const rows = db.all(
    `SELECT e.id AS employee_id, e.employee_no, e.name AS employee_name, d.name AS department_name,
      COUNT(a.id) AS total_days,
      SUM(CASE WHEN a.status = 'normal' THEN 1 ELSE 0 END) AS normal_days,
      SUM(CASE WHEN a.status = 'late' THEN 1 ELSE 0 END) AS late_days,
      SUM(CASE WHEN a.status = 'absent' THEN 1 ELSE 0 END) AS absent_days,
      SUM(CASE WHEN a.status = 'leave' THEN 1 ELSE 0 END) AS leave_days,
      ROUND(SUM(a.overtime_hours), 1) AS overtime_hours
     FROM employees e
     LEFT JOIN departments d ON d.id = e.department_id
     LEFT JOIN attendance a ON a.employee_id = e.id AND substr(a.work_date, 1, 7) = ?
     WHERE e.employment_status IN ('active', 'probation', 'leave') ${req.user.role === 'employee' ? 'AND e.id = ?' : req.query.departmentId ? 'AND e.department_id = ?' : ''}
     GROUP BY e.id ORDER BY e.employee_no ASC`,
    req.user.role === 'employee' ? [month, req.user.employeeId] : req.query.departmentId ? [month, Number(req.query.departmentId)] : [month]
  );
  res.json({ success: true, data: rows });
}));

router.get('/', asyncHandler(async (req, res) => {
  const { where, params } = whereFor(req);
  const allowedSort = ['work_date', 'employee_name', 'status', 'check_in', 'overtime_hours'];
  const { page, pageSize, offset, sortBy, sortOrder } = pagination(req.query, allowedSort, 'work_date');
  const sortColumn = sortBy === 'employee_name' ? 'e.name' : `a.${sortBy}`;
  const total = Number(db.get(
    `SELECT COUNT(*) AS count FROM attendance a JOIN employees e ON e.id = a.employee_id WHERE ${where}`,
    params
  ).count);
  const rows = db.all(
    `SELECT a.*, e.name AS employee_name, e.employee_no, d.name AS department_name
     FROM attendance a JOIN employees e ON e.id = a.employee_id
     LEFT JOIN departments d ON d.id = e.department_id
     WHERE ${where} ORDER BY ${sortColumn} ${sortOrder} LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );
  res.json({ success: true, data: { list: rows, total, page, pageSize } });
}));

router.post('/', asyncHandler(async (req, res) => {
  if (!['admin', 'hr'].includes(req.user.role)) throw new AppError(403, 'FORBIDDEN', '员工不能创建考勤记录');
  requireFields(req.body || {}, ['employee_id', 'work_date', 'status']);
  if (db.get('SELECT id FROM attendance WHERE employee_id = ? AND work_date = ?', [Number(req.body.employee_id), req.body.work_date])) {
    throw new AppError(409, 'DUPLICATE_ATTENDANCE', '该员工当天已有考勤记录');
  }
  let id;
  db.transaction(() => {
    id = db.run(
      `INSERT INTO attendance (employee_id, work_date, check_in, check_out, status, overtime_hours, remark, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [Number(req.body.employee_id), req.body.work_date, req.body.check_in || null, req.body.check_out || null, req.body.status, Number(req.body.overtime_hours) || 0, req.body.remark || '', now()]
    ).id;
    audit(req, 'CREATE_ATTENDANCE', 'attendance', id, req.body);
  });
  res.status(201).json({ success: true, data: { id }, message: '考勤记录已创建' });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  if (!['admin', 'hr'].includes(req.user.role)) throw new AppError(403, 'FORBIDDEN', '员工不能修改考勤记录');
  const id = Number(req.params.id);
  const current = db.get('SELECT * FROM attendance WHERE id = ?', [id]);
  if (!current) throw new AppError(404, 'NOT_FOUND', '考勤记录不存在');
  requireFields(req.body || {}, ['status']);
  db.transaction(() => {
    db.run(
      `UPDATE attendance SET check_in = ?, check_out = ?, status = ?, overtime_hours = ?, remark = ? WHERE id = ?`,
      [req.body.check_in || null, req.body.check_out || null, req.body.status, Number(req.body.overtime_hours) || 0, req.body.remark || '', id]
    );
    audit(req, 'UPDATE_ATTENDANCE', 'attendance', id, { before: current, after: req.body });
  });
  res.json({ success: true, data: { id }, message: '考勤记录已更新' });
}));

module.exports = router;

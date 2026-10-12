const express = require('express');
const db = require('../lib/db');
const { AppError, asyncHandler, requireFields, now, audit, pagination } = require('../lib/utils');
const { requireRole } = require('../lib/middleware');

const router = express.Router();

router.get('/', asyncHandler(async (req, res) => {
  const rows = db.all(
    `SELECT d.id, d.parent_id, d.name, d.code, d.manager_name, d.sort_order, d.created_at,
            COUNT(e.id) AS employee_count
     FROM departments d
     LEFT JOIN employees e ON e.department_id = d.id AND e.employment_status IN ('active', 'probation', 'leave')
     GROUP BY d.id ORDER BY d.sort_order ASC, d.id ASC`
  );
  res.json({ success: true, data: rows.map((row) => ({ ...row, employee_count: Number(row.employee_count) })) });
}));

router.post('/', requireRole('admin', 'hr'), asyncHandler(async (req, res) => {
  requireFields(req.body || {}, ['name', 'code']);
  const parentId = req.body.parent_id ? Number(req.body.parent_id) : null;
  if (parentId && !db.get('SELECT id FROM departments WHERE id = ?', [parentId])) {
    throw new AppError(400, 'INVALID_PARENT', '上级部门不存在');
  }
  if (db.get('SELECT id FROM departments WHERE code = ?', [String(req.body.code).trim().toUpperCase()])) {
    throw new AppError(409, 'DUPLICATE_CODE', '部门编码已存在');
  }
  let id;
  db.transaction(() => {
    id = db.run(
      'INSERT INTO departments (parent_id, name, code, manager_name, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [parentId, String(req.body.name).trim(), String(req.body.code).trim().toUpperCase(), req.body.manager_name || '', Number(req.body.sort_order) || 0, now()]
    ).id;
    audit(req, 'CREATE_DEPARTMENT', 'department', id, req.body);
  });
  res.status(201).json({ success: true, data: { id }, message: '部门已创建' });
}));

router.put('/:id', requireRole('admin', 'hr'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const current = db.get('SELECT * FROM departments WHERE id = ?', [id]);
  if (!current) throw new AppError(404, 'NOT_FOUND', '部门不存在');
  requireFields(req.body || {}, ['name', 'code']);
  const parentId = req.body.parent_id ? Number(req.body.parent_id) : null;
  if (parentId === id) throw new AppError(400, 'INVALID_PARENT', '部门不能将自身设为上级');
  if (parentId) {
    const descendant = db.get(
      `WITH RECURSIVE children(id) AS (
        SELECT id FROM departments WHERE parent_id = ? UNION ALL
        SELECT d.id FROM departments d JOIN children c ON d.parent_id = c.id
      ) SELECT id FROM children WHERE id = ?`,
      [id, parentId]
    );
    if (descendant) throw new AppError(400, 'INVALID_PARENT', '不能将下级部门设为上级');
  }
  const duplicate = db.get('SELECT id FROM departments WHERE code = ? AND id != ?', [String(req.body.code).trim().toUpperCase(), id]);
  if (duplicate) throw new AppError(409, 'DUPLICATE_CODE', '部门编码已存在');
  db.transaction(() => {
    db.run(
      'UPDATE departments SET parent_id = ?, name = ?, code = ?, manager_name = ?, sort_order = ? WHERE id = ?',
      [parentId, String(req.body.name).trim(), String(req.body.code).trim().toUpperCase(), req.body.manager_name || '', Number(req.body.sort_order) || 0, id]
    );
    audit(req, 'UPDATE_DEPARTMENT', 'department', id, req.body);
  });
  res.json({ success: true, data: { id }, message: '部门已更新' });
}));

router.delete('/:id', requireRole('admin', 'hr'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const department = db.get('SELECT * FROM departments WHERE id = ?', [id]);
  if (!department) throw new AppError(404, 'NOT_FOUND', '部门不存在');
  const children = db.get('SELECT COUNT(*) AS count FROM departments WHERE parent_id = ?', [id]).count;
  const employees = db.get(`SELECT COUNT(*) AS count FROM employees WHERE department_id = ? AND employment_status IN ('active', 'probation', 'leave')`, [id]).count;
  const positions = db.get('SELECT COUNT(*) AS count FROM positions WHERE department_id = ?', [id]).count;
  if (children || employees || positions) {
    const reasons = [];
    if (children) reasons.push(`包含 ${children} 个下级部门`);
    if (employees) reasons.push(`仍有 ${employees} 名在职员工`);
    if (positions) reasons.push(`关联 ${positions} 个职位`);
    throw new AppError(409, 'DEPARTMENT_IN_USE', `无法删除：该部门${reasons.join('，')}。请先处理后再操作`);
  }
  db.transaction(() => {
    db.run('DELETE FROM departments WHERE id = ?', [id]);
    audit(req, 'DELETE_DEPARTMENT', 'department', id, { name: department.name, code: department.code });
  });
  res.json({ success: true, data: { id }, message: '部门已删除' });
}));

router.get('/positions/list', asyncHandler(async (req, res) => {
  const params = [];
  let where = 'WHERE 1 = 1';
  if (req.query.departmentId) {
    where += ' AND p.department_id = ?';
    params.push(Number(req.query.departmentId));
  }
  if (req.query.keyword) {
    where += ' AND (p.name LIKE ? OR p.code LIKE ?)';
    const keyword = `%${req.query.keyword}%`;
    params.push(keyword, keyword);
  }
  const rows = db.all(
    `SELECT p.*, d.name AS department_name,
      (SELECT COUNT(*) FROM employees e WHERE e.position_id = p.id AND e.employment_status IN ('active', 'probation', 'leave')) AS employee_count
     FROM positions p LEFT JOIN departments d ON d.id = p.department_id
     ${where} ORDER BY d.sort_order ASC, p.id ASC`,
    params
  );
  res.json({ success: true, data: rows.map((row) => ({ ...row, employee_count: Number(row.employee_count) })) });
}));

router.post('/positions', requireRole('admin', 'hr'), asyncHandler(async (req, res) => {
  requireFields(req.body || {}, ['department_id', 'name', 'code']);
  if (!db.get('SELECT id FROM departments WHERE id = ?', [Number(req.body.department_id)])) {
    throw new AppError(400, 'INVALID_DEPARTMENT', '所属部门不存在');
  }
  if (db.get('SELECT id FROM positions WHERE code = ?', [String(req.body.code).trim().toUpperCase()])) {
    throw new AppError(409, 'DUPLICATE_CODE', '职位编码已存在');
  }
  let id;
  db.transaction(() => {
    id = db.run(
      'INSERT INTO positions (department_id, name, code, level, headcount, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [Number(req.body.department_id), String(req.body.name).trim(), String(req.body.code).trim().toUpperCase(), req.body.level || '', Number(req.body.headcount) || 0, now()]
    ).id;
    audit(req, 'CREATE_POSITION', 'position', id, req.body);
  });
  res.status(201).json({ success: true, data: { id }, message: '职位已创建' });
}));

router.put('/positions/:id', requireRole('admin', 'hr'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const current = db.get('SELECT * FROM positions WHERE id = ?', [id]);
  if (!current) throw new AppError(404, 'NOT_FOUND', '职位不存在');
  requireFields(req.body || {}, ['department_id', 'name', 'code']);
  const duplicate = db.get('SELECT id FROM positions WHERE code = ? AND id != ?', [String(req.body.code).trim().toUpperCase(), id]);
  if (duplicate) throw new AppError(409, 'DUPLICATE_CODE', '职位编码已存在');
  if (!db.get('SELECT id FROM departments WHERE id = ?', [Number(req.body.department_id)])) throw new AppError(400, 'INVALID_DEPARTMENT', '所属部门不存在');
  db.transaction(() => {
    db.run(
      'UPDATE positions SET department_id = ?, name = ?, code = ?, level = ?, headcount = ? WHERE id = ?',
      [Number(req.body.department_id), String(req.body.name).trim(), String(req.body.code).trim().toUpperCase(), req.body.level || '', Number(req.body.headcount) || 0, id]
    );
    audit(req, 'UPDATE_POSITION', 'position', id, req.body);
  });
  res.json({ success: true, data: { id }, message: '职位已更新' });
}));

router.delete('/positions/:id', requireRole('admin', 'hr'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const position = db.get('SELECT * FROM positions WHERE id = ?', [id]);
  if (!position) throw new AppError(404, 'NOT_FOUND', '职位不存在');
  const employees = db.get(`SELECT COUNT(*) AS count FROM employees WHERE position_id = ? AND employment_status IN ('active', 'probation', 'leave')`, [id]).count;
  if (employees) throw new AppError(409, 'POSITION_IN_USE', `无法删除：仍有 ${employees} 名在职员工担任该职位。请先完成调岗后再操作`);
  db.transaction(() => {
    db.run('DELETE FROM positions WHERE id = ?', [id]);
    audit(req, 'DELETE_POSITION', 'position', id, position);
  });
  res.json({ success: true, data: { id }, message: '职位已删除' });
}));

module.exports = router;

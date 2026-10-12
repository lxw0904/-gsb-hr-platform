import express from 'express';
import { db } from '../db.js';
import { AppError, asyncHandler, sendSuccess } from '../errors.js';
import { ROLES, requireRoles } from '../middleware.js';
import { writeAudit } from '../audit.js';
import { normalizePagination, resolveSort } from '../utils.js';

export const departmentRouter = express.Router();
export const positionRouter = express.Router();

function departmentRow(id) {
  return db.prepare(`
    SELECT d.*,
      (SELECT COUNT(*) FROM departments c WHERE c.parent_id = d.id) AS child_count,
      (SELECT COUNT(*) FROM positions p WHERE p.department_id = d.id) AS position_count,
      (SELECT COUNT(*) FROM employees e WHERE e.department_id = d.id AND e.status = 'ACTIVE') AS employee_count,
      (SELECT e.name FROM employees e WHERE e.id = d.manager_id) AS manager_name
    FROM departments d WHERE d.id = ?
  `).get(Number(id));
}

function assertValidParent(id, parentId) {
  if (!parentId) return;
  if (Number(parentId) === Number(id)) throw new AppError(400, 'INVALID_PARENT', '部门不能把自己设为上级部门');
  const parent = db.prepare('SELECT id FROM departments WHERE id = ?').get(Number(parentId));
  if (!parent) throw new AppError(400, 'INVALID_PARENT', '上级部门不存在');
  if (id) {
    const descendant = db.prepare(`
      WITH RECURSIVE descendants(id) AS (
        SELECT id FROM departments WHERE parent_id = ?
        UNION ALL
        SELECT d.id FROM departments d JOIN descendants x ON d.parent_id = x.id
      ) SELECT id FROM descendants WHERE id = ?
    `).get(id, Number(parentId));
    if (descendant) throw new AppError(409, 'DEPARTMENT_CYCLE', '不能把下级部门设为上级部门');
  }
}

departmentRouter.get('/', requireRoles(ROLES.ADMIN, ROLES.HR), asyncHandler(async (req, res) => {
  const conditions = ['1 = 1'];
  const params = [];
  const keyword = String(req.query.q || '').trim();
  if (keyword) {
    conditions.push('(d.name LIKE ? OR d.description LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`);
  }
  if (req.query.status) {
    conditions.push('d.status = ?');
    params.push(String(req.query.status).toUpperCase());
  }
  const { sortBy, sortOrder } = resolveSort(req.query, { name: 'd.name', status: 'd.status', createdAt: 'd.created_at' }, 'name');
  const rows = db.prepare(`
    SELECT d.*,
      (SELECT COUNT(*) FROM departments c WHERE c.parent_id = d.id) AS child_count,
      (SELECT COUNT(*) FROM positions p WHERE p.department_id = d.id) AS position_count,
      (SELECT COUNT(*) FROM employees e WHERE e.department_id = d.id AND e.status = 'ACTIVE') AS employee_count,
      (SELECT e.name FROM employees e WHERE e.id = d.manager_id) AS manager_name,
      parent.name AS parent_name
    FROM departments d
    LEFT JOIN departments parent ON parent.id = d.parent_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY ${sortBy} ${sortOrder}, d.id ASC
  `).all(...params);
  return sendSuccess(res, rows);
}));

departmentRouter.post('/', requireRoles(ROLES.ADMIN, ROLES.HR), asyncHandler(async (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) throw new AppError(400, 'VALIDATION_ERROR', '部门名称不能为空');
  const parentId = req.body?.parentId ? Number(req.body.parentId) : null;
  assertValidParent(null, parentId);
  if (db.prepare('SELECT id FROM departments WHERE name = ?').get(name)) throw new AppError(409, 'DEPARTMENT_EXISTS', '部门名称已存在');
  const status = String(req.body?.status || 'ACTIVE').toUpperCase();
  if (!['ACTIVE', 'INACTIVE'].includes(status)) throw new AppError(400, 'VALIDATION_ERROR', '部门状态无效');
  const result = db.prepare(`
    INSERT INTO departments (name, parent_id, manager_id, status, description) VALUES (?, ?, ?, ?, ?)
  `).run(name, parentId, req.body?.managerId || null, status, String(req.body?.description || '').trim());
  writeAudit(req, 'CREATE_DEPARTMENT', 'DEPARTMENT', result.lastInsertRowid, { name });
  return sendSuccess(res, departmentRow(result.lastInsertRowid), undefined, 201);
}));

departmentRouter.put('/:id', requireRoles(ROLES.ADMIN, ROLES.HR), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const current = departmentRow(id);
  if (!current) throw new AppError(404, 'DEPARTMENT_NOT_FOUND', '部门不存在');
  const name = String(req.body?.name || '').trim();
  if (!name) throw new AppError(400, 'VALIDATION_ERROR', '部门名称不能为空');
  const duplicate = db.prepare('SELECT id FROM departments WHERE name = ? AND id <> ?').get(name, id);
  if (duplicate) throw new AppError(409, 'DEPARTMENT_EXISTS', '部门名称已存在');
  const parentId = req.body?.parentId ? Number(req.body.parentId) : null;
  assertValidParent(id, parentId);
  const status = String(req.body?.status || current.status).toUpperCase();
  if (!['ACTIVE', 'INACTIVE'].includes(status)) throw new AppError(400, 'VALIDATION_ERROR', '部门状态无效');
  if (status === 'INACTIVE' && current.employee_count > 0) {
    throw new AppError(409, 'DEPARTMENT_HAS_ACTIVE_EMPLOYEES', `部门仍有 ${current.employee_count} 名在职员工，不能停用`);
  }
  db.prepare(`
    UPDATE departments SET name = ?, parent_id = ?, manager_id = ?, status = ?, description = ?,
      updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(name, parentId, req.body?.managerId || null, status, String(req.body?.description || '').trim(), id);
  writeAudit(req, 'UPDATE_DEPARTMENT', 'DEPARTMENT', id, { before: current.name, after: name, status });
  return sendSuccess(res, departmentRow(id));
}));

departmentRouter.delete('/:id', requireRoles(ROLES.ADMIN, ROLES.HR), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const department = departmentRow(id);
  if (!department) throw new AppError(404, 'DEPARTMENT_NOT_FOUND', '部门不存在');
  const childCount = db.prepare('SELECT COUNT(*) AS count FROM departments WHERE parent_id = ?').get(id).count;
  const employeeCount = db.prepare('SELECT COUNT(*) AS count FROM employees WHERE department_id = ?').get(id).count;
  const activeCount = db.prepare(`SELECT COUNT(*) AS count FROM employees WHERE department_id = ? AND status = 'ACTIVE'`).get(id).count;
  if (childCount > 0 || employeeCount > 0) {
    const reasons = [];
    if (childCount) reasons.push(`存在 ${childCount} 个下级部门`);
    if (employeeCount) reasons.push(`关联 ${employeeCount} 名员工（其中在职 ${activeCount} 名）`);
    throw new AppError(409, 'DEPARTMENT_DELETE_BLOCKED', `不能删除部门：${reasons.join('，')}。请先调整或迁移关联数据。`);
  }
  db.prepare('DELETE FROM departments WHERE id = ?').run(id);
  writeAudit(req, 'DELETE_DEPARTMENT', 'DEPARTMENT', id, { name: department.name });
  return sendSuccess(res, null);
}));

positionRouter.get('/', requireRoles(ROLES.ADMIN, ROLES.HR), asyncHandler(async (req, res) => {
  const conditions = ['1 = 1'];
  const params = [];
  const keyword = String(req.query.q || '').trim();
  if (keyword) {
    conditions.push('(p.name LIKE ? OR p.description LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`);
  }
  if (req.query.departmentId) {
    conditions.push('p.department_id = ?');
    params.push(Number(req.query.departmentId));
  }
  if (req.query.status) {
    conditions.push('p.status = ?');
    params.push(String(req.query.status).toUpperCase());
  }
  const { page, pageSize, offset } = normalizePagination(req.query);
  const { sortBy, sortOrder } = resolveSort(req.query, {
    name: 'p.name', departmentName: 'd.name', level: 'p.level', status: 'p.status', employeeCount: 'employee_count',
  }, 'name');
  const where = conditions.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) AS count FROM positions p JOIN departments d ON d.id = p.department_id WHERE ${where}`).get(...params).count;
  const rows = db.prepare(`
    SELECT p.*, d.name AS department_name,
      (SELECT COUNT(*) FROM employees e WHERE e.position_id = p.id AND e.status = 'ACTIVE') AS employee_count
    FROM positions p JOIN departments d ON d.id = p.department_id
    WHERE ${where}
    ORDER BY ${sortBy} ${sortOrder}, p.id ASC LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset);
  return sendSuccess(res, rows.map((row) => ({ ...row, employeeCount: row.employee_count })), {
    page, pageSize, total, totalPages: Math.ceil(total / pageSize) || 1,
  });
}));

positionRouter.post('/', requireRoles(ROLES.ADMIN, ROLES.HR), asyncHandler(async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const departmentId = Number(req.body?.departmentId);
  const level = String(req.body?.level || 'P3').trim().toUpperCase();
  const status = String(req.body?.status || 'ACTIVE').toUpperCase();
  if (!name || !departmentId) throw new AppError(400, 'VALIDATION_ERROR', '职位名称和所属部门不能为空');
  const department = db.prepare('SELECT id, status FROM departments WHERE id = ?').get(departmentId);
  if (!department) throw new AppError(400, 'INVALID_DEPARTMENT', '所属部门不存在');
  if (!['ACTIVE', 'INACTIVE'].includes(status)) throw new AppError(400, 'VALIDATION_ERROR', '职位状态无效');
  if (db.prepare('SELECT id FROM positions WHERE name = ? AND department_id = ?').get(name, departmentId)) {
    throw new AppError(409, 'POSITION_EXISTS', '该部门下已存在同名职位');
  }
  const result = db.prepare(`
    INSERT INTO positions (name, department_id, level, status, description) VALUES (?, ?, ?, ?, ?)
  `).run(name, departmentId, level, status, String(req.body?.description || '').trim());
  writeAudit(req, 'CREATE_POSITION', 'POSITION', result.lastInsertRowid, { name, departmentId });
  const row = db.prepare('SELECT p.*, d.name AS department_name, 0 AS employee_count FROM positions p JOIN departments d ON d.id = p.department_id WHERE p.id = ?').get(result.lastInsertRowid);
  return sendSuccess(res, row, undefined, 201);
}));

positionRouter.put('/:id', requireRoles(ROLES.ADMIN, ROLES.HR), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const current = db.prepare('SELECT * FROM positions WHERE id = ?').get(id);
  if (!current) throw new AppError(404, 'POSITION_NOT_FOUND', '职位不存在');
  const name = String(req.body?.name || '').trim();
  const departmentId = Number(req.body?.departmentId);
  const level = String(req.body?.level || current.level).trim().toUpperCase();
  const status = String(req.body?.status || current.status).toUpperCase();
  if (!name || !departmentId) throw new AppError(400, 'VALIDATION_ERROR', '职位名称和所属部门不能为空');
  if (!db.prepare('SELECT id FROM departments WHERE id = ?').get(departmentId)) throw new AppError(400, 'INVALID_DEPARTMENT', '所属部门不存在');
  if (db.prepare('SELECT id FROM positions WHERE name = ? AND department_id = ? AND id <> ?').get(name, departmentId, id)) {
    throw new AppError(409, 'POSITION_EXISTS', '该部门下已存在同名职位');
  }
  const activeCount = db.prepare(`SELECT COUNT(*) AS count FROM employees WHERE position_id = ? AND status = 'ACTIVE'`).get(id).count;
  if (status === 'INACTIVE' && activeCount) throw new AppError(409, 'POSITION_HAS_ACTIVE_EMPLOYEES', `职位仍有 ${activeCount} 名在职员工，不能停用`);
  db.prepare(`
    UPDATE positions SET name = ?, department_id = ?, level = ?, status = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(name, departmentId, level, status, String(req.body?.description || '').trim(), id);
  writeAudit(req, 'UPDATE_POSITION', 'POSITION', id, { before: current.name, after: name, departmentId, level, status });
  const row = db.prepare(`
    SELECT p.*, d.name AS department_name,
      (SELECT COUNT(*) FROM employees e WHERE e.position_id = p.id AND e.status = 'ACTIVE') AS employee_count
    FROM positions p JOIN departments d ON d.id = p.department_id WHERE p.id = ?
  `).get(id);
  return sendSuccess(res, row);
}));

positionRouter.delete('/:id', requireRoles(ROLES.ADMIN, ROLES.HR), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const position = db.prepare('SELECT * FROM positions WHERE id = ?').get(id);
  if (!position) throw new AppError(404, 'POSITION_NOT_FOUND', '职位不存在');
  const activeCount = db.prepare(`SELECT COUNT(*) AS count FROM employees WHERE position_id = ? AND status = 'ACTIVE'`).get(id).count;
  const totalCount = db.prepare('SELECT COUNT(*) AS count FROM employees WHERE position_id = ?').get(id).count;
  if (activeCount > 0 || totalCount > 0) {
    throw new AppError(409, 'POSITION_DELETE_BLOCKED', `不能删除职位：当前关联 ${totalCount} 名员工，其中在职 ${activeCount} 名。请先调岗或停止使用该职位。`);
  }
  db.prepare('DELETE FROM positions WHERE id = ?').run(id);
  writeAudit(req, 'DELETE_POSITION', 'POSITION', id, { name: position.name });
  return sendSuccess(res, null);
}));

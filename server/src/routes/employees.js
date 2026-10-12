import express from 'express';
import { db } from '../db.js';
import { AppError, asyncHandler, sendSuccess } from '../errors.js';
import { ROLES, requireRoles } from '../middleware.js';
import { assertTransition, EMPLOYEE_TRANSITIONS } from '../state.js';
import { encryptSensitive } from '../security.js';
import { serializeEmployee } from '../serializers.js';
import { writeAudit } from '../audit.js';
import { normalizePagination, resolveSort, toCsv } from '../utils.js';

export const employeeRouter = express.Router();

const employeeSelect = `
  SELECT e.*, d.name AS department_name, p.name AS position_name, p.level AS position_level
  FROM employees e
  JOIN departments d ON d.id = e.department_id
  JOIN positions p ON p.id = e.position_id
`;

function employeeById(id) {
  return db.prepare(`${employeeSelect} WHERE e.id = ?`).get(Number(id));
}

function getOrgContext(departmentId, positionId) {
  const department = db.prepare('SELECT * FROM departments WHERE id = ?').get(Number(departmentId));
  if (!department) throw new AppError(400, 'INVALID_DEPARTMENT', '所选部门不存在');
  if (department.status !== 'ACTIVE') throw new AppError(409, 'DEPARTMENT_INACTIVE', '所选部门已停用');
  const position = db.prepare('SELECT * FROM positions WHERE id = ?').get(Number(positionId));
  if (!position) throw new AppError(400, 'INVALID_POSITION', '所选职位不存在');
  if (position.status !== 'ACTIVE') throw new AppError(409, 'POSITION_INACTIVE', '所选职位已停用');
  if (Number(position.department_id) !== Number(department.id)) {
    throw new AppError(400, 'POSITION_DEPARTMENT_MISMATCH', '所选职位不属于该部门');
  }
  return { department, position };
}

function validateEmployeePayload(body) {
  const employeeNo = String(body?.employeeNo || '').trim();
  const name = String(body?.name || '').trim();
  const gender = String(body?.gender || '').toUpperCase();
  const departmentId = Number(body?.departmentId);
  const positionId = Number(body?.positionId);
  const hireDate = String(body?.hireDate || '').slice(0, 10);
  const errors = [];
  if (!employeeNo) errors.push({ field: 'employeeNo', message: '工号不能为空' });
  if (!name) errors.push({ field: 'name', message: '姓名不能为空' });
  if (!['MALE', 'FEMALE', 'OTHER'].includes(gender)) errors.push({ field: 'gender', message: '性别值无效' });
  if (!departmentId) errors.push({ field: 'departmentId', message: '部门不能为空' });
  if (!positionId) errors.push({ field: 'positionId', message: '职位不能为空' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hireDate)) errors.push({ field: 'hireDate', message: '入职日期格式应为 YYYY-MM-DD' });
  const baseSalary = Number(body?.baseSalary ?? 0);
  if (!Number.isFinite(baseSalary) || baseSalary < 0) errors.push({ field: 'baseSalary', message: '基本工资必须为非负数' });
  if (errors.length) throw new AppError(400, 'VALIDATION_ERROR', '员工资料校验失败', errors);
  getOrgContext(departmentId, positionId);
  return { employeeNo, name, gender, departmentId, positionId, hireDate, baseSalary };
}

function assertEmployeeNoUnique(employeeNo, exceptId = null) {
  const row = db.prepare('SELECT id FROM employees WHERE employee_no = ? AND (? IS NULL OR id <> ?)')
    .get(employeeNo, exceptId, exceptId);
  if (row) throw new AppError(409, 'EMPLOYEE_NO_EXISTS', `工号 ${employeeNo} 已存在`);
}

function updateEmployeeRecord(id, body) {
  const core = validateEmployeePayload(body);
  assertEmployeeNoUnique(core.employeeNo, id);
  const current = employeeById(id);
  if (!current) throw new AppError(404, 'EMPLOYEE_NOT_FOUND', '员工不存在');
  db.prepare(`
    UPDATE employees SET
      employee_no = ?, name = ?, gender = ?, birth_date = ?, id_card = ?, phone = ?, email = ?,
      address = ?, emergency_contact = ?, emergency_phone = ?, department_id = ?, position_id = ?,
      hire_date = ?, base_salary = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    core.employeeNo,
    core.name,
    core.gender,
    body.birthDate || null,
    encryptSensitive(body.idCard),
    String(body.phone || '').trim(),
    String(body.email || '').trim(),
    String(body.address || '').trim(),
    String(body.emergencyContact || '').trim(),
    String(body.emergencyPhone || '').trim(),
    core.departmentId,
    core.positionId,
    core.hireDate,
    core.baseSalary,
    id,
  );
  return { before: current, after: employeeById(id) };
}

function createEmployeeRecord(body) {
  const core = validateEmployeePayload(body);
  assertEmployeeNoUnique(core.employeeNo);
  const result = db.prepare(`
    INSERT INTO employees (
      employee_no, name, gender, birth_date, id_card, phone, email, address,
      emergency_contact, emergency_phone, department_id, position_id, hire_date, status, base_salary
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)
  `).run(
    core.employeeNo,
    core.name,
    core.gender,
    body.birthDate || null,
    encryptSensitive(body.idCard),
    String(body.phone || '').trim(),
    String(body.email || '').trim(),
    String(body.address || '').trim(),
    String(body.emergencyContact || '').trim(),
    String(body.emergencyPhone || '').trim(),
    core.departmentId,
    core.positionId,
    core.hireDate,
    core.baseSalary,
  );
  return employeeById(result.lastInsertRowid);
}

employeeRouter.get('/me', asyncHandler(async (req, res) => {
  if (!req.user.employeeId) throw new AppError(404, 'EMPLOYEE_PROFILE_NOT_FOUND', '当前账号未关联员工档案');
  const employee = employeeById(req.user.employeeId);
  if (!employee) throw new AppError(404, 'EMPLOYEE_NOT_FOUND', '员工档案不存在');
  return sendSuccess(res, serializeEmployee(employee, req.user.role, req.user.employeeId));
}));

employeeRouter.put('/me', asyncHandler(async (req, res) => {
  if (!req.user.employeeId) throw new AppError(404, 'EMPLOYEE_PROFILE_NOT_FOUND', '当前账号未关联员工档案');
  const before = employeeById(req.user.employeeId);
  if (!before) throw new AppError(404, 'EMPLOYEE_NOT_FOUND', '员工档案不存在');
  db.prepare(`
    UPDATE employees SET phone = ?, email = ?, address = ?, emergency_contact = ?, emergency_phone = ?,
      updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(
    String(req.body?.phone || '').trim(),
    String(req.body?.email || '').trim(),
    String(req.body?.address || '').trim(),
    String(req.body?.emergencyContact || '').trim(),
    String(req.body?.emergencyPhone || '').trim(),
    req.user.employeeId,
  );
  const after = employeeById(req.user.employeeId);
  writeAudit(req, 'UPDATE_PROFILE', 'EMPLOYEE', req.user.employeeId, { fields: ['phone', 'email', 'address', 'emergencyContact', 'emergencyPhone'] });
  return sendSuccess(res, serializeEmployee(after, req.user.role, req.user.employeeId));
}));

employeeRouter.get('/export', requireRoles(ROLES.ADMIN, ROLES.HR), asyncHandler(async (req, res) => {
  const rows = db.prepare(`${employeeSelect} ORDER BY e.employee_no ASC`).all()
    .map((row) => serializeEmployee(row, req.user.role, req.user.employeeId));
  const csv = toCsv([
    { key: 'employeeNo', label: '工号' },
    { key: 'name', label: '姓名' },
    { key: 'gender', label: '性别' },
    { key: 'birthDate', label: '出生日期' },
    { key: 'idCard', label: '身份证号' },
    { key: 'phone', label: '手机号' },
    { key: 'email', label: '邮箱' },
    { key: 'departmentName', label: '部门' },
    { key: 'positionName', label: '职位' },
    { key: 'hireDate', label: '入职日期' },
    { key: 'leaveDate', label: '离职日期' },
    { key: 'status', label: '状态' },
    { key: 'baseSalary', label: '基本工资' },
  ], rows);
  writeAudit(req, 'EXPORT_EMPLOYEES', 'EMPLOYEE', 'all', { count: rows.length });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="employees-${new Date().toISOString().slice(0, 10)}.csv"`);
  return res.send(csv);
}));

employeeRouter.post('/import', requireRoles(ROLES.ADMIN, ROLES.HR), asyncHandler(async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!items.length) throw new AppError(400, 'EMPTY_IMPORT', 'CSV 中没有可导入的数据');
  if (items.length > 500) throw new AppError(400, 'IMPORT_LIMIT', '单次最多导入 500 条员工记录');

  const errors = [];
  const normalized = [];
  const departmentByName = db.prepare('SELECT id, status FROM departments WHERE name = ?');
  const positionByName = db.prepare('SELECT id, department_id, status FROM positions WHERE name = ?');

  items.forEach((item, index) => {
    const rowNumber = Number(item.__row || index + 2);
    try {
      const departmentId = item.departmentId
        ? Number(item.departmentId)
        : departmentByName.get(String(item.departmentName || item.department || item.部门 || '').trim())?.id;
      const position = item.positionId
        ? db.prepare('SELECT id, department_id, status FROM positions WHERE id = ?').get(Number(item.positionId))
        : positionByName.get(String(item.positionName || item.position || item.职位 || '').trim());
      const payload = {
        ...item,
        employeeNo: item.employeeNo || item.工号,
        name: item.name || item.姓名,
        gender: item.gender || ({ 男: 'MALE', 女: 'FEMALE' }[item.性别]) || item.性别,
        birthDate: item.birthDate || item.出生日期,
        idCard: item.idCard || item.身份证号,
        phone: item.phone || item.手机号,
        email: item.email || item.邮箱,
        departmentId,
        positionId: position?.id,
        hireDate: item.hireDate || item.入职日期,
        baseSalary: item.baseSalary || item.基本工资 || 0,
        address: item.address || item.地址,
        emergencyContact: item.emergencyContact || item.紧急联系人,
        emergencyPhone: item.emergencyPhone || item.紧急联系电话,
      };
      const core = validateEmployeePayload(payload);
      assertEmployeeNoUnique(core.employeeNo);
      normalized.push({ ...payload, ...core, __row: rowNumber });
    } catch (error) {
      if (error instanceof AppError && Array.isArray(error.details)) {
        error.details.forEach((detail) => errors.push({ row: rowNumber, ...detail }));
      } else {
        errors.push({ row: rowNumber, field: 'row', message: error.message || '该行数据无效' });
      }
    }
  });

  if (errors.length) throw new AppError(400, 'CSV_IMPORT_INVALID', `导入数据有 ${errors.length} 处错误，请修正后重试`, errors);

  db.exec('BEGIN IMMEDIATE');
  try {
    for (const item of normalized) createEmployeeRecord(item);
    writeAudit(req, 'BATCH_IMPORT_EMPLOYEES', 'EMPLOYEE', 'batch', { count: normalized.length, source: 'CSV' });
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return sendSuccess(res, { imported: normalized.length }, undefined, 201);
}));

employeeRouter.get('/', requireRoles(ROLES.ADMIN, ROLES.HR), asyncHandler(async (req, res) => {
  const conditions = ['1 = 1'];
  const params = [];
  const keyword = String(req.query.q || '').trim();
  if (keyword) {
    conditions.push('(e.name LIKE ? OR e.employee_no LIKE ? OR e.phone LIKE ? OR e.email LIKE ?)');
    const like = `%${keyword}%`;
    params.push(like, like, like, like);
  }
  if (req.query.departmentId) {
    conditions.push(`e.department_id IN (
      WITH RECURSIVE descendants(id) AS (
        SELECT id FROM departments WHERE id = ?
        UNION ALL
        SELECT d.id FROM departments d JOIN descendants x ON d.parent_id = x.id
      ) SELECT id FROM descendants
    )`);
    params.push(Number(req.query.departmentId));
  }
  if (req.query.positionId) {
    conditions.push('e.position_id = ?');
    params.push(Number(req.query.positionId));
  }
  if (req.query.status) {
    conditions.push('e.status = ?');
    params.push(String(req.query.status).toUpperCase());
  }
  const { page, pageSize, offset } = normalizePagination(req.query);
  const { sortBy, sortOrder } = resolveSort(req.query, {
    employeeNo: 'e.employee_no', name: 'e.name', departmentName: 'd.name', hireDate: 'e.hire_date', status: 'e.status',
  }, 'employeeNo');
  const where = conditions.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) AS count FROM employees e JOIN departments d ON d.id = e.department_id WHERE ${where}`).get(...params).count;
  const rows = db.prepare(`
    ${employeeSelect}
    WHERE ${where}
    ORDER BY ${sortBy} ${sortOrder}, e.id ASC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset);
  return sendSuccess(res, rows.map((row) => serializeEmployee(row, req.user.role, req.user.employeeId)), {
    page, pageSize, total, totalPages: Math.ceil(total / pageSize) || 1,
  });
}));

employeeRouter.get('/:id', requireRoles(ROLES.ADMIN, ROLES.HR), asyncHandler(async (req, res) => {
  const employee = employeeById(req.params.id);
  if (!employee) throw new AppError(404, 'EMPLOYEE_NOT_FOUND', '员工不存在');
  return sendSuccess(res, serializeEmployee(employee, req.user.role, req.user.employeeId));
}));

employeeRouter.post('/', requireRoles(ROLES.ADMIN, ROLES.HR), asyncHandler(async (req, res) => {
  const employee = createEmployeeRecord(req.body);
  writeAudit(req, 'CREATE_EMPLOYEE', 'EMPLOYEE', employee.id, { employeeNo: employee.employee_no, name: employee.name });
  return sendSuccess(res, serializeEmployee(employee, req.user.role, req.user.employeeId), undefined, 201);
}));

employeeRouter.put('/:id', requireRoles(ROLES.ADMIN, ROLES.HR), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const { before, after } = updateEmployeeRecord(id, req.body);
  writeAudit(req, 'UPDATE_EMPLOYEE', 'EMPLOYEE', id, {
    employeeNo: after.employee_no,
    changedFields: Object.keys(req.body || {}),
    salaryBefore: Number(before.base_salary),
    salaryAfter: Number(after.base_salary),
  });
  return sendSuccess(res, serializeEmployee(after, req.user.role, req.user.employeeId));
}));

employeeRouter.post('/:id/transfer', requireRoles(ROLES.ADMIN, ROLES.HR), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const current = employeeById(id);
  if (!current) throw new AppError(404, 'EMPLOYEE_NOT_FOUND', '员工不存在');
  if (current.status !== 'ACTIVE') throw new AppError(409, 'EMPLOYEE_NOT_ACTIVE', '离职员工不能调岗');
  const { department, position } = getOrgContext(req.body?.departmentId, req.body?.positionId);
  db.prepare(`
    UPDATE employees SET department_id = ?, position_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(department.id, position.id, id);
  writeAudit(req, 'TRANSFER_EMPLOYEE', 'EMPLOYEE', id, {
    from: { departmentId: current.department_id, departmentName: current.department_name, positionId: current.position_id, positionName: current.position_name },
    to: { departmentId: department.id, departmentName: department.name, positionId: position.id, positionName: position.name },
  });
  return sendSuccess(res, serializeEmployee(employeeById(id), req.user.role, req.user.employeeId));
}));

employeeRouter.post('/:id/offboard', requireRoles(ROLES.ADMIN, ROLES.HR), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const current = employeeById(id);
  if (!current) throw new AppError(404, 'EMPLOYEE_NOT_FOUND', '员工不存在');
  assertTransition(EMPLOYEE_TRANSITIONS, current.status, 'LEFT', '员工状态');
  const leaveDate = String(req.body?.leaveDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(leaveDate)) throw new AppError(400, 'VALIDATION_ERROR', '请选择有效的离职日期');
  if (leaveDate < current.hire_date) throw new AppError(400, 'INVALID_LEAVE_DATE', '离职日期不能早于入职日期');
  db.prepare(`
    UPDATE employees SET status = 'LEFT', leave_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(leaveDate, id);
  db.prepare('UPDATE users SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE employee_id = ? AND is_active = 1').run(id);
  writeAudit(req, 'OFFBOARD_EMPLOYEE', 'EMPLOYEE', id, { employeeNo: current.employee_no, leaveDate, reason: req.body?.reason || '' });
  return sendSuccess(res, serializeEmployee(employeeById(id), req.user.role, req.user.employeeId));
}));

employeeRouter.delete('/:id', requireRoles(ROLES.ADMIN, ROLES.HR), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const employee = employeeById(id);
  if (!employee) throw new AppError(404, 'EMPLOYEE_NOT_FOUND', '员工不存在');
  const dependencies = [
    { label: '考勤记录', count: db.prepare('SELECT COUNT(*) AS count FROM attendance WHERE employee_id = ?').get(id).count },
    { label: '请假记录', count: db.prepare('SELECT COUNT(*) AS count FROM leave_requests WHERE employee_id = ?').get(id).count },
    { label: '工资单', count: db.prepare('SELECT COUNT(*) AS count FROM payrolls WHERE employee_id = ?').get(id).count },
    { label: '登录账号', count: db.prepare('SELECT COUNT(*) AS count FROM users WHERE employee_id = ?').get(id).count },
  ].filter((item) => item.count > 0);
  if (dependencies.length) {
    throw new AppError(409, 'EMPLOYEE_HAS_DEPENDENCIES', `不能删除员工：仍有关联${dependencies.map((item) => `${item.label} ${item.count} 条`).join('、')}。建议改为办理离职。`);
  }
  db.prepare('DELETE FROM employees WHERE id = ?').run(id);
  writeAudit(req, 'DELETE_EMPLOYEE', 'EMPLOYEE', id, { employeeNo: employee.employee_no, name: employee.name });
  return sendSuccess(res, null);
}));


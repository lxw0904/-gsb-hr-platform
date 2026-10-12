const express = require('express');
const multer = require('multer');
const db = require('../lib/db');
const { AppError, asyncHandler, requireFields, now, audit, pagination, toEmployee, parseCsv, toCsv } = require('../lib/utils');
const { requireRole } = require('../lib/middleware');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
router.use(requireRole('admin', 'hr'));

const employeeSelect = `
  SELECT e.*, d.name AS department_name, p.name AS position_name, m.name AS manager_name
  FROM employees e
  LEFT JOIN departments d ON d.id = e.department_id
  LEFT JOIN positions p ON p.id = e.position_id
  LEFT JOIN employees m ON m.id = e.manager_id
`;

function employeeFilters(query) {
  const params = [];
  const conditions = ['1 = 1'];
  if (query.keyword) {
    conditions.push('(e.name LIKE ? OR e.employee_no LIKE ? OR e.phone LIKE ? OR e.email LIKE ?)');
    const keyword = `%${String(query.keyword).trim()}%`;
    params.push(keyword, keyword, keyword, keyword);
  }
  if (query.departmentId) {
    conditions.push('e.department_id = ?');
    params.push(Number(query.departmentId));
  }
  if (query.status) {
    conditions.push('e.employment_status = ?');
    params.push(query.status);
  }
  if (query.positionId) {
    conditions.push('e.position_id = ?');
    params.push(Number(query.positionId));
  }
  return { where: conditions.join(' AND '), params };
}

function validateEmployee(body, isUpdate = false) {
  requireFields(body, ['employee_no', 'name', 'hire_date', 'department_id', 'position_id']);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.hire_date))) throw new AppError(400, 'VALIDATION_ERROR', '入职日期格式应为 YYYY-MM-DD');
  if (!db.get('SELECT id FROM departments WHERE id = ?', [Number(body.department_id)])) throw new AppError(400, 'INVALID_DEPARTMENT', '所属部门不存在');
  const position = db.get('SELECT id, department_id FROM positions WHERE id = ?', [Number(body.position_id)]);
  if (!position) throw new AppError(400, 'INVALID_POSITION', '职位不存在');
  if (Number(position.department_id) !== Number(body.department_id)) throw new AppError(400, 'POSITION_MISMATCH', '职位与所属部门不匹配');
  const duplicate = db.get('SELECT id FROM employees WHERE employee_no = ?', [String(body.employee_no).trim()]);
  if (duplicate && (!isUpdate || duplicate.id !== Number(body.id))) throw new AppError(409, 'DUPLICATE_EMPLOYEE_NO', '工号已存在');
}

router.get('/export', asyncHandler(async (req, res) => {
  const { where, params } = employeeFilters(req.query);
  const employees = db.all(`${employeeSelect} WHERE ${where} ORDER BY e.employee_no ASC LIMIT 10000`, params);
  const csv = toCsv([
    { key: 'employee_no', label: '工号' }, { key: 'name', label: '姓名' }, { key: 'gender', label: '性别' },
    { key: 'phone', label: '手机号' }, { key: 'email', label: '邮箱' }, { key: 'id_card', label: '身份证号' },
    { key: 'department_name', label: '部门' }, { key: 'position_name', label: '职位' }, { key: 'hire_date', label: '入职日期' },
    { key: 'employment_status', label: '状态' }, { key: 'base_salary', label: '基本工资' }, { key: 'address', label: '住址' },
    { key: 'emergency_contact', label: '紧急联系人' }, { key: 'emergency_phone', label: '紧急联系电话' }
  ], employees);
  audit(req, 'EXPORT_EMPLOYEES', 'employee', 'filtered', { count: employees.length, filters: req.query });
  db.persist();
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="employees-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
}));

router.post('/import', upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError(400, 'FILE_REQUIRED', '请选择要导入的 CSV 文件');
  const records = parseCsv(req.file.buffer.toString('utf8'));
  if (!records.length) throw new AppError(400, 'EMPTY_FILE', 'CSV 文件没有可导入的数据');
  const requiredHeaders = ['employee_no', 'name', 'gender', 'phone', 'email', 'department', 'position', 'hire_date', 'base_salary'];
  const first = records[0].data;
  const missingHeaders = requiredHeaders.filter((header) => !Object.prototype.hasOwnProperty.call(first, header));
  if (missingHeaders.length) throw new AppError(400, 'INVALID_HEADERS', `缺少表头：${missingHeaders.join('、')}`);
  const errors = [];
  const seen = new Set();
  const departments = db.all('SELECT id, name FROM departments');
  const positions = db.all('SELECT id, name, department_id FROM positions');
  records.forEach(({ line, data }) => {
    const rowErrors = [];
    requiredHeaders.forEach((field) => { if (!String(data[field] || '').trim()) rowErrors.push(`${field} 不能为空`); });
    if (data.gender && !['male', 'female', 'unknown'].includes(data.gender)) rowErrors.push('gender 只能为 male/female/unknown');
    if (data.hire_date && !/^\d{4}-\d{2}-\d{2}$/.test(data.hire_date)) rowErrors.push('hire_date 格式应为 YYYY-MM-DD');
    if (Number.isNaN(Number(data.base_salary)) || Number(data.base_salary) < 0) rowErrors.push('base_salary 必须为非负数字');
    const employeeNo = String(data.employee_no || '').trim();
    if (seen.has(employeeNo)) rowErrors.push(`工号 ${employeeNo} 在文件中重复`);
    if (db.get('SELECT id FROM employees WHERE employee_no = ?', [employeeNo])) rowErrors.push(`工号 ${employeeNo} 已存在`);
    seen.add(employeeNo);
    const department = departments.find((item) => item.name === String(data.department || '').trim());
    const position = positions.find((item) => item.name === String(data.position || '').trim());
    if (!department) rowErrors.push(`部门“${data.department || ''}”不存在`);
    if (!position) rowErrors.push(`职位“${data.position || ''}”不存在`);
    if (department && position && Number(position.department_id) !== Number(department.id)) rowErrors.push('职位与部门不匹配');
    if (rowErrors.length) errors.push({ line, employee_no: employeeNo, messages: rowErrors });
  });
  if (errors.length) throw new AppError(400, 'IMPORT_VALIDATION_FAILED', `有 ${errors.length} 行数据未通过校验，请修正后重试`, { rows: errors });
  let imported = 0;
  db.transaction(() => {
    records.forEach(({ data }) => {
      const department = departments.find((item) => item.name === data.department.trim());
      const position = positions.find((item) => item.name === data.position.trim());
      db.run(
        `INSERT INTO employees (
          employee_no, name, gender, phone, email, id_card, address, emergency_contact, emergency_phone,
          department_id, position_id, hire_date, employment_status, base_salary, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'probation', ?, ?, ?)`,
        [data.employee_no.trim(), data.name.trim(), data.gender || 'unknown', data.phone || '', data.email || '', data.id_card || '',
          data.address || '', data.emergency_contact || '', data.emergency_phone || '', department.id, position.id, data.hire_date,
          Number(data.base_salary), now(), now()]
      );
      imported += 1;
    });
    audit(req, 'IMPORT_EMPLOYEES', 'employee', 'csv', { count: imported, fileName: req.file.originalname });
  });
  res.json({ success: true, data: { imported }, message: `成功导入 ${imported} 名员工` });
}));

router.get('/', asyncHandler(async (req, res) => {
  const { where, params } = employeeFilters(req.query);
  const allowedSort = ['employee_no', 'name', 'hire_date', 'employment_status', 'created_at', 'department_name', 'base_salary'];
  const { page, pageSize, offset, sortBy, sortOrder } = pagination(req.query, allowedSort, 'employee_no');
  const sortColumn = sortBy === 'department_name' ? 'd.name' : `e.${sortBy}`;
  const total = Number(db.get(`SELECT COUNT(*) AS count FROM employees e WHERE ${where}`, params).count);
  const rows = db.all(
    `${employeeSelect} WHERE ${where} ORDER BY ${sortColumn} ${sortOrder} LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );
  res.json({ success: true, data: { list: rows.map((row) => toEmployee(row, req.user)), total, page, pageSize } });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const employee = db.get(`${employeeSelect} WHERE e.id = ?`, [Number(req.params.id)]);
  if (!employee) throw new AppError(404, 'NOT_FOUND', '员工档案不存在');
  res.json({ success: true, data: toEmployee(employee, req.user) });
}));

router.post('/', asyncHandler(async (req, res) => {
  const body = { ...req.body, id: 0 };
  validateEmployee(body);
  let id;
  db.transaction(() => {
    id = db.run(
      `INSERT INTO employees (
        employee_no, name, gender, birth_date, phone, email, id_card, address, emergency_contact,
        emergency_phone, department_id, position_id, manager_id, hire_date, probation_end_date,
        employment_status, base_salary, bank_account, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [String(body.employee_no).trim(), String(body.name).trim(), body.gender || 'unknown', body.birth_date || null,
        body.phone || '', body.email || '', body.id_card || '', body.address || '', body.emergency_contact || '',
        body.emergency_phone || '', Number(body.department_id), Number(body.position_id), body.manager_id ? Number(body.manager_id) : null,
        body.hire_date, body.probation_end_date || null, body.employment_status || 'probation', Number(body.base_salary) || 0,
        body.bank_account || '', now(), now()]
    ).id;
    audit(req, 'CREATE_EMPLOYEE', 'employee', id, { employee_no: body.employee_no, name: body.name, base_salary: body.base_salary });
  });
  res.status(201).json({ success: true, data: { id }, message: '员工档案已创建' });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const current = db.get('SELECT * FROM employees WHERE id = ?', [id]);
  if (!current) throw new AppError(404, 'NOT_FOUND', '员工档案不存在');
  if (current.employment_status === 'terminated') throw new AppError(409, 'INVALID_STATE', '离职员工档案不可直接编辑，请先办理复职');
  const body = { ...req.body, id };
  validateEmployee(body, true);
  if (Object.prototype.hasOwnProperty.call(body, 'base_salary') && Number(body.base_salary) !== Number(current.base_salary)) {
    throw new AppError(400, 'SALARY_WORKFLOW_REQUIRED', '基本工资调整必须通过“调薪审批”流程办理');
  }
  const allowed = ['employee_no', 'name', 'gender', 'birth_date', 'phone', 'email', 'id_card', 'address',
    'emergency_contact', 'emergency_phone', 'department_id', 'position_id', 'manager_id', 'hire_date',
    'probation_end_date', 'employment_status', 'bank_account'];
  const changed = allowed.filter((field) => Object.prototype.hasOwnProperty.call(body, field));
  if (!changed.length) throw new AppError(400, 'VALIDATION_ERROR', '没有可更新的字段');
  const values = changed.map((field) => {
    if (['department_id', 'position_id'].includes(field)) return Number(body[field]);
    if (field === 'manager_id') return body[field] ? Number(body[field]) : null;
    return body[field];
  });
  db.transaction(() => {
    db.run(`UPDATE employees SET ${changed.map((field) => `${field} = ?`).join(', ')}, updated_at = ? WHERE id = ?`, [...values, now(), id]);
    audit(req, 'UPDATE_EMPLOYEE', 'employee', id, { fields: changed, before: { department_id: current.department_id, position_id: current.position_id, status: current.employment_status }, after: body });
  });
  res.json({ success: true, data: { id }, message: '员工档案已更新' });
}));

router.post('/:id/terminate', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const employee = db.get('SELECT * FROM employees WHERE id = ?', [id]);
  if (!employee) throw new AppError(404, 'NOT_FOUND', '员工档案不存在');
  if (!['active', 'probation', 'leave'].includes(employee.employment_status)) throw new AppError(409, 'INVALID_STATE', '当前状态不允许办理离职');
  requireFields(req.body || {}, ['termination_date', 'reason']);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(req.body.termination_date)) throw new AppError(400, 'VALIDATION_ERROR', '离职日期格式应为 YYYY-MM-DD');
  if (req.body.confirm !== true) throw new AppError(400, 'CONFIRM_REQUIRED', '离职属于关键操作，请完成二次确认');
  db.transaction(() => {
    db.run('UPDATE employees SET employment_status = ?, termination_date = ?, updated_at = ? WHERE id = ?', ['terminated', req.body.termination_date, now(), id]);
    db.run('UPDATE users SET status = ?, updated_at = ? WHERE employee_id = ?', ['disabled', now(), id]);
    audit(req, 'TERMINATE_EMPLOYEE', 'employee', id, { employee_no: employee.employee_no, name: employee.name, termination_date: req.body.termination_date, reason: req.body.reason });
  });
  res.json({ success: true, data: { id }, message: '离职手续已办理' });
}));

module.exports = router;

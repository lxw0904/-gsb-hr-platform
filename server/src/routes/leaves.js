import express from 'express';
import { db } from '../db.js';
import { AppError, asyncHandler, sendSuccess } from '../errors.js';
import { ROLES, requireRoles } from '../middleware.js';
import { assertTransition, LEAVE_TRANSITIONS } from '../state.js';
import { writeAudit } from '../audit.js';
import { normalizePagination, resolveSort, toCsv } from '../utils.js';

export const leaveRouter = express.Router();

const leaveSelect = `
  SELECT l.*, e.name AS employee_name, e.employee_no, d.name AS department_name,
         u.username AS approver_name
  FROM leave_requests l
  JOIN employees e ON e.id = l.employee_id
  JOIN departments d ON d.id = e.department_id
  LEFT JOIN users u ON u.id = l.approver_id
`;

function calculateDays(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
}

function validateLeave(body) {
  const type = String(body?.type || '').toUpperCase();
  const startDate = String(body?.startDate || '').slice(0, 10);
  const endDate = String(body?.endDate || '').slice(0, 10);
  const reason = String(body?.reason || '').trim();
  const allowedTypes = ['ANNUAL', 'SICK', 'PERSONAL', 'MATERNITY', 'MARRIAGE', 'OTHER'];
  const errors = [];
  if (!allowedTypes.includes(type)) errors.push({ field: 'type', message: '请假类型无效' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) errors.push({ field: 'startDate', message: '开始日期格式无效' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) errors.push({ field: 'endDate', message: '结束日期格式无效' });
  if (startDate && endDate && endDate < startDate) errors.push({ field: 'endDate', message: '结束日期不能早于开始日期' });
  if (!reason) errors.push({ field: 'reason', message: '请假事由不能为空' });
  if (reason.length > 500) errors.push({ field: 'reason', message: '请假事由不能超过 500 字' });
  if (errors.length) throw new AppError(400, 'VALIDATION_ERROR', '请假申请校验失败', errors);
  const days = calculateDays(startDate, endDate);
  if (days <= 0 || days > 180) throw new AppError(400, 'INVALID_LEAVE_DAYS', '单次请假天数必须在 1 到 180 天之间');
  return { type, startDate, endDate, days, reason };
}

function buildFilters(req, paginated = true) {
  const conditions = ['1 = 1'];
  const params = [];
  if (req.user.role === ROLES.EMPLOYEE) {
    conditions.push('l.employee_id = ?');
    params.push(req.user.employeeId);
  } else if (req.query.employeeId) {
    conditions.push('l.employee_id = ?');
    params.push(Number(req.query.employeeId));
  }
  const keyword = String(req.query.q || '').trim();
  if (keyword) {
    conditions.push('(e.name LIKE ? OR e.employee_no LIKE ? OR l.reason LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  if (req.query.departmentId) {
    conditions.push('e.department_id = ?');
    params.push(Number(req.query.departmentId));
  }
  if (req.query.status) {
    conditions.push('l.status = ?');
    params.push(String(req.query.status).toUpperCase());
  }
  if (req.query.type) {
    conditions.push('l.type = ?');
    params.push(String(req.query.type).toUpperCase());
  }
  if (req.query.month) {
    conditions.push('substr(l.start_date, 1, 7) = ?');
    params.push(String(req.query.month));
  }
  const pagination = paginated ? normalizePagination(req.query) : null;
  const { sortBy, sortOrder } = resolveSort(req.query, {
    createdAt: 'l.created_at', startDate: 'l.start_date', endDate: 'l.end_date', status: 'l.status',
    employeeName: 'e.name', departmentName: 'd.name', days: 'l.days',
  }, 'createdAt', 'DESC');
  return { where: conditions.join(' AND '), params, pagination, sortBy, sortOrder };
}

function getLeave(id) {
  return db.prepare(`${leaveSelect} WHERE l.id = ?`).get(Number(id));
}

leaveRouter.get('/export', asyncHandler(async (req, res) => {
  const { where, params, sortBy, sortOrder } = buildFilters(req, false);
  const rows = db.prepare(`${leaveSelect} WHERE ${where} ORDER BY ${sortBy} ${sortOrder}`).all(...params);
  const csv = toCsv([
    { key: 'employee_no', label: '工号' }, { key: 'employee_name', label: '姓名' }, { key: 'department_name', label: '部门' },
    { key: 'type', label: '请假类型' }, { key: 'start_date', label: '开始日期' }, { key: 'end_date', label: '结束日期' },
    { key: 'days', label: '天数' }, { key: 'reason', label: '事由' }, { key: 'status', label: '状态' },
    { key: 'approver_name', label: '审批人' }, { key: 'comment', label: '审批意见' }, { key: 'created_at', label: '申请时间' },
  ], rows);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="leave-requests-${Date.now()}.csv"`);
  return res.send(csv);
}));

leaveRouter.get('/', asyncHandler(async (req, res) => {
  const { where, params, pagination, sortBy, sortOrder } = buildFilters(req);
  const total = db.prepare(`
    SELECT COUNT(*) AS count FROM leave_requests l JOIN employees e ON e.id = l.employee_id WHERE ${where}
  `).get(...params).count;
  const rows = db.prepare(`${leaveSelect} WHERE ${where} ORDER BY ${sortBy} ${sortOrder}, l.id DESC LIMIT ? OFFSET ?`)
    .all(...params, pagination.pageSize, pagination.offset);
  return sendSuccess(res, rows, {
    page: pagination.page, pageSize: pagination.pageSize, total, totalPages: Math.ceil(total / pagination.pageSize) || 1,
  });
}));

leaveRouter.post('/', asyncHandler(async (req, res) => {
  if (!req.user.employeeId) throw new AppError(409, 'EMPLOYEE_REQUIRED', '当前账号未关联员工，无法提交请假');
  const data = validateLeave(req.body);
  const result = db.prepare(`
    INSERT INTO leave_requests (employee_id, type, start_date, end_date, days, reason, status)
    VALUES (?, ?, ?, ?, ?, ?, 'DRAFT')
  `).run(req.user.employeeId, data.type, data.startDate, data.endDate, data.days, data.reason);
  writeAudit(req, 'CREATE_LEAVE_DRAFT', 'LEAVE', result.lastInsertRowid, data);
  if (req.body?.submit === true) {
    db.prepare(`UPDATE leave_requests SET status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(result.lastInsertRowid);
    writeAudit(req, 'SUBMIT_LEAVE', 'LEAVE', result.lastInsertRowid, { from: 'DRAFT', to: 'PENDING' });
  }
  return sendSuccess(res, getLeave(result.lastInsertRowid), undefined, 201);
}));

leaveRouter.put('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const current = getLeave(id);
  if (!current) throw new AppError(404, 'LEAVE_NOT_FOUND', '请假申请不存在');
  const isOwner = Number(current.employee_id) === Number(req.user.employeeId);
  if (!isOwner && req.user.role === ROLES.EMPLOYEE) throw new AppError(403, 'FORBIDDEN', '不能修改他人的请假申请');
  if (current.status !== 'DRAFT') throw new AppError(409, 'LEAVE_NOT_EDITABLE', '只有草稿状态的请假申请可以编辑');
  const data = validateLeave(req.body);
  db.prepare(`
    UPDATE leave_requests SET type = ?, start_date = ?, end_date = ?, days = ?, reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(data.type, data.startDate, data.endDate, data.days, data.reason, id);
  writeAudit(req, 'UPDATE_LEAVE_DRAFT', 'LEAVE', id, { before: current, after: data });
  return sendSuccess(res, getLeave(id));
}));

leaveRouter.post('/:id/submit', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const current = getLeave(id);
  if (!current) throw new AppError(404, 'LEAVE_NOT_FOUND', '请假申请不存在');
  if (Number(current.employee_id) !== Number(req.user.employeeId)) throw new AppError(403, 'FORBIDDEN', '只能提交自己的请假申请');
  assertTransition(LEAVE_TRANSITIONS, current.status, 'PENDING', '请假状态');
  db.prepare(`UPDATE leave_requests SET status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id);
  writeAudit(req, 'SUBMIT_LEAVE', 'LEAVE', id, { from: current.status, to: 'PENDING' });
  return sendSuccess(res, getLeave(id));
}));

function transitionLeave(req, targetStatus, allowedCurrentStatuses, auditAction) {
  const id = Number(req.params.id);
  const current = getLeave(id);
  if (!current) throw new AppError(404, 'LEAVE_NOT_FOUND', '请假申请不存在');
  assertTransition(LEAVE_TRANSITIONS, current.status, targetStatus, '请假状态');
  if (!allowedCurrentStatuses.includes(current.status)) throw new AppError(409, 'INVALID_STATE_TRANSITION', '当前状态不允许此操作');
  return { id, current };
}

leaveRouter.post('/:id/cancel', asyncHandler(async (req, res) => {
  const { id, current } = transitionLeave(req, 'CANCELLED', ['DRAFT', 'PENDING'], 'CANCEL_LEAVE');
  const isOwner = Number(current.employee_id) === Number(req.user.employeeId);
  if (!isOwner && req.user.role === ROLES.EMPLOYEE) throw new AppError(403, 'FORBIDDEN', '只能取消自己的请假申请');
  db.prepare(`UPDATE leave_requests SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id);
  writeAudit(req, 'CANCEL_LEAVE', 'LEAVE', id, { from: current.status, to: 'CANCELLED', reason: req.body?.reason || '' });
  return sendSuccess(res, getLeave(id));
}));

leaveRouter.post('/:id/approve', requireRoles(ROLES.ADMIN, ROLES.HR), asyncHandler(async (req, res) => {
  const { id, current } = transitionLeave(req, 'APPROVED', ['PENDING'], 'APPROVE_LEAVE');
  if (Number(current.employee_id) === Number(req.user.employeeId)) throw new AppError(403, 'SELF_APPROVAL_FORBIDDEN', '不能审批自己的请假申请');
  db.prepare(`
    UPDATE leave_requests SET status = 'APPROVED', approver_id = ?, approved_at = CURRENT_TIMESTAMP,
      comment = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(req.user.id, String(req.body?.comment || '同意').trim(), id);
  writeAudit(req, 'APPROVE_LEAVE', 'LEAVE', id, { from: current.status, to: 'APPROVED', comment: req.body?.comment || '' });
  return sendSuccess(res, getLeave(id));
}));

leaveRouter.post('/:id/reject', requireRoles(ROLES.ADMIN, ROLES.HR), asyncHandler(async (req, res) => {
  const { id, current } = transitionLeave(req, 'REJECTED', ['PENDING'], 'REJECT_LEAVE');
  if (Number(current.employee_id) === Number(req.user.employeeId)) throw new AppError(403, 'SELF_APPROVAL_FORBIDDEN', '不能审批自己的请假申请');
  const comment = String(req.body?.comment || '').trim();
  if (!comment) throw new AppError(400, 'VALIDATION_ERROR', '驳回时必须填写审批意见');
  db.prepare(`
    UPDATE leave_requests SET status = 'REJECTED', approver_id = ?, approved_at = CURRENT_TIMESTAMP,
      comment = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(req.user.id, comment, id);
  writeAudit(req, 'REJECT_LEAVE', 'LEAVE', id, { from: current.status, to: 'REJECTED', comment });
  return sendSuccess(res, getLeave(id));
}));

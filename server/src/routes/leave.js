const express = require('express');
const db = require('../lib/db');
const { AppError, asyncHandler, requireFields, now, audit, pagination } = require('../lib/utils');

const router = express.Router();

function leaveSelect() {
  return `SELECT l.*, e.name AS employee_name, e.employee_no, d.name AS department_name,
                 u.username AS approver_name
          FROM leave_requests l
          JOIN employees e ON e.id = l.employee_id
          LEFT JOIN departments d ON d.id = e.department_id
          LEFT JOIN users u ON u.id = l.approver_id`;
}

function filters(req) {
  const conditions = ['1 = 1'];
  const params = [];
  if (req.user.role === 'employee') {
    conditions.push('l.employee_id = ?');
    params.push(req.user.employeeId);
  } else if (req.query.departmentId) {
    conditions.push('e.department_id = ?');
    params.push(Number(req.query.departmentId));
  }
  if (req.query.keyword) {
    conditions.push('(e.name LIKE ? OR e.employee_no LIKE ? OR l.reason LIKE ?)');
    const keyword = `%${req.query.keyword}%`;
    params.push(keyword, keyword, keyword);
  }
  if (req.query.status) {
    conditions.push('l.status = ?');
    params.push(req.query.status);
  }
  if (req.query.type) {
    conditions.push('l.type = ?');
    params.push(req.query.type);
  }
  if (req.query.month) {
    conditions.push('substr(l.start_time, 1, 7) = ?');
    params.push(req.query.month);
  }
  return { where: conditions.join(' AND '), params };
}

router.get('/', asyncHandler(async (req, res) => {
  const { where, params } = filters(req);
  const allowedSort = ['created_at', 'start_time', 'status', 'employee_name', 'type'];
  const { page, pageSize, offset, sortBy, sortOrder } = pagination(req.query, allowedSort, 'created_at');
  const sortColumn = sortBy === 'employee_name' ? 'e.name' : `l.${sortBy}`;
  const total = Number(db.get(`SELECT COUNT(*) AS count FROM leave_requests l JOIN employees e ON e.id = l.employee_id WHERE ${where}`, params).count);
  const rows = db.all(`${leaveSelect()} WHERE ${where} ORDER BY ${sortColumn} ${sortOrder} LIMIT ? OFFSET ?`, [...params, pageSize, offset]);
  res.json({ success: true, data: { list: rows, total, page, pageSize } });
}));

router.post('/', asyncHandler(async (req, res) => {
  if (!req.user.employeeId) throw new AppError(400, 'NO_EMPLOYEE_PROFILE', '当前账号未绑定员工档案，无法提交请假');
  requireFields(req.body || {}, ['type', 'start_time', 'end_time', 'reason']);
  if (new Date(req.body.end_time) <= new Date(req.body.start_time)) throw new AppError(400, 'INVALID_TIME_RANGE', '结束时间必须晚于开始时间');
  if (!['annual', 'sick', 'personal', 'marriage', 'maternity', 'compensatory'].includes(req.body.type)) throw new AppError(400, 'INVALID_LEAVE_TYPE', '请假类型不正确');
  const status = req.body.submit ? 'pending' : 'draft';
  let id;
  db.transaction(() => {
    id = db.run(
      `INSERT INTO leave_requests (employee_id, type, start_time, end_time, reason, status, submitted_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.employeeId, req.body.type, req.body.start_time, req.body.end_time, String(req.body.reason).trim(), status, status === 'pending' ? now() : null, now(), now()]
    ).id;
    audit(req, status === 'pending' ? 'SUBMIT_LEAVE' : 'CREATE_LEAVE_DRAFT', 'leave', id, { type: req.body.type, start_time: req.body.start_time, end_time: req.body.end_time });
  });
  res.status(201).json({ success: true, data: { id, status }, message: status === 'pending' ? '请假申请已提交' : '请假草稿已保存' });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const leave = db.get('SELECT * FROM leave_requests WHERE id = ?', [id]);
  if (!leave) throw new AppError(404, 'NOT_FOUND', '请假申请不存在');
  if (leave.employee_id !== req.user.employeeId) throw new AppError(403, 'FORBIDDEN', '只能编辑自己的请假申请');
  if (leave.status !== 'draft') throw new AppError(409, 'INVALID_STATE', '只有草稿状态的申请可以编辑');
  requireFields(req.body || {}, ['type', 'start_time', 'end_time', 'reason']);
  if (new Date(req.body.end_time) <= new Date(req.body.start_time)) throw new AppError(400, 'INVALID_TIME_RANGE', '结束时间必须晚于开始时间');
  db.transaction(() => {
    db.run(
      'UPDATE leave_requests SET type = ?, start_time = ?, end_time = ?, reason = ?, updated_at = ? WHERE id = ? AND status = ?',
      [req.body.type, req.body.start_time, req.body.end_time, String(req.body.reason).trim(), now(), id, 'draft']
    );
    audit(req, 'UPDATE_LEAVE_DRAFT', 'leave', id, req.body);
  });
  res.json({ success: true, data: { id }, message: '请假申请已更新' });
}));

router.post('/:id/submit', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const leave = db.get('SELECT * FROM leave_requests WHERE id = ?', [id]);
  if (!leave) throw new AppError(404, 'NOT_FOUND', '请假申请不存在');
  if (leave.employee_id !== req.user.employeeId) throw new AppError(403, 'FORBIDDEN', '只能提交自己的请假申请');
  if (leave.status !== 'draft') throw new AppError(409, 'INVALID_STATE', '只有草稿可以提交审批');
  db.transaction(() => {
    db.run('UPDATE leave_requests SET status = ?, submitted_at = ?, updated_at = ? WHERE id = ? AND status = ?', ['pending', now(), now(), id, 'draft']);
    audit(req, 'SUBMIT_LEAVE', 'leave', id, { from: 'draft', to: 'pending' });
  });
  res.json({ success: true, data: { id, status: 'pending' }, message: '请假申请已提交审批' });
}));

router.post('/:id/cancel', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const leave = db.get('SELECT * FROM leave_requests WHERE id = ?', [id]);
  if (!leave) throw new AppError(404, 'NOT_FOUND', '请假申请不存在');
  if (leave.employee_id !== req.user.employeeId) throw new AppError(403, 'FORBIDDEN', '只能撤销自己的请假申请');
  if (!['draft', 'pending'].includes(leave.status)) throw new AppError(409, 'INVALID_STATE', '当前状态不允许撤销');
  db.transaction(() => {
    db.run('UPDATE leave_requests SET status = ?, updated_at = ? WHERE id = ? AND status = ?', ['cancelled', now(), id, leave.status]);
    audit(req, 'CANCEL_LEAVE', 'leave', id, { from: leave.status, to: 'cancelled' });
  });
  res.json({ success: true, data: { id, status: 'cancelled' }, message: '申请已撤销' });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const leave = db.get('SELECT * FROM leave_requests WHERE id = ?', [id]);
  if (!leave) throw new AppError(404, 'NOT_FOUND', '请假申请不存在');
  if (leave.employee_id !== req.user.employeeId) throw new AppError(403, 'FORBIDDEN', '只能删除自己的请假申请');
  if (leave.status !== 'draft') throw new AppError(409, 'INVALID_STATE', '只有草稿可以删除');
  if (req.body?.confirm !== true) throw new AppError(400, 'CONFIRM_REQUIRED', '删除草稿需要二次确认');
  db.transaction(() => {
    db.run('DELETE FROM leave_requests WHERE id = ? AND status = ?', [id, 'draft']);
    audit(req, 'DELETE_LEAVE_DRAFT', 'leave', id, leave);
  });
  res.json({ success: true, data: { id }, message: '请假草稿已删除' });
}));

router.post('/:id/decision', asyncHandler(async (req, res) => {
  if (!['admin', 'hr'].includes(req.user.role)) throw new AppError(403, 'FORBIDDEN', '当前角色无权审批请假');
  const id = Number(req.params.id);
  const decision = req.body?.decision;
  if (!['approve', 'reject'].includes(decision)) throw new AppError(400, 'VALIDATION_ERROR', '审批结果不正确');
  const leave = db.get('SELECT * FROM leave_requests WHERE id = ?', [id]);
  if (!leave) throw new AppError(404, 'NOT_FOUND', '请假申请不存在');
  if (leave.status !== 'pending') throw new AppError(409, 'INVALID_STATE', '只有待审批申请可以处理');
  const nextStatus = decision === 'approve' ? 'approved' : 'rejected';
  db.transaction(() => {
    db.run(
      'UPDATE leave_requests SET status = ?, approver_id = ?, approval_comment = ?, approved_at = ?, updated_at = ? WHERE id = ? AND status = ?',
      [nextStatus, req.user.id, req.body.comment || '', now(), now(), id, 'pending']
    );
    audit(req, decision === 'approve' ? 'APPROVE_LEAVE' : 'REJECT_LEAVE', 'leave', id, { employee_id: leave.employee_id, from: 'pending', to: nextStatus, comment: req.body.comment || '' });
  });
  res.json({ success: true, data: { id, status: nextStatus }, message: decision === 'approve' ? '请假申请已通过' : '请假申请已驳回' });
}));

router.post('/batch-decision', asyncHandler(async (req, res) => {
  if (!['admin', 'hr'].includes(req.user.role)) throw new AppError(403, 'FORBIDDEN', '当前角色无权审批请假');
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Boolean) : [];
  const decision = req.body?.decision;
  if (!ids.length) throw new AppError(400, 'VALIDATION_ERROR', '请选择要处理的申请');
  if (!['approve', 'reject'].includes(decision)) throw new AppError(400, 'VALIDATION_ERROR', '审批结果不正确');
  const placeholders = ids.map(() => '?').join(',');
  const pendingRows = db.all(`SELECT * FROM leave_requests WHERE id IN (${placeholders}) AND status = 'pending'`, ids);
  if (pendingRows.length !== ids.length) throw new AppError(409, 'INVALID_SELECTION', '所选申请中包含非待审批状态的数据，请刷新后重试');
  const nextStatus = decision === 'approve' ? 'approved' : 'rejected';
  db.transaction(() => {
    db.run(
      `UPDATE leave_requests SET status = ?, approver_id = ?, approval_comment = ?, approved_at = ?, updated_at = ?
       WHERE status = 'pending' AND id IN (${placeholders})`,
      [nextStatus, req.user.id, req.body.comment || '', now(), now(), ...ids]
    );
    audit(req, decision === 'approve' ? 'BATCH_APPROVE_LEAVE' : 'BATCH_REJECT_LEAVE', 'leave', ids.join(','), { count: ids.length, to: nextStatus });
  });
  res.json({ success: true, data: { count: ids.length }, message: `已批量处理 ${ids.length} 条申请` });
}));

module.exports = router;

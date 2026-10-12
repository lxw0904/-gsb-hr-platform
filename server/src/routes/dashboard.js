import express from 'express';
import { db } from '../db.js';
import { asyncHandler, sendSuccess } from '../errors.js';
import { ROLES } from '../middleware.js';

export const dashboardRouter = express.Router();

function monthKeys(count = 6) {
  const now = new Date();
  const keys = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    keys.push(date.toISOString().slice(0, 7));
  }
  return keys;
}

dashboardRouter.get('/', asyncHandler(async (req, res) => {
  const months = monthKeys(6);
  const firstMonth = months[0];
  const currentMonth = months.at(-1);

  if (req.user.role === ROLES.EMPLOYEE) {
    const attendance = db.prepare(`
      SELECT month, work_days AS workDays, actual_days AS actualDays, late_count AS lateCount,
             absent_days AS absentDays, overtime_hours AS overtimeHours, status
      FROM attendance WHERE employee_id = ? ORDER BY month DESC LIMIT 6
    `).all(req.user.employeeId);
    const leaves = db.prepare(`
      SELECT status, COUNT(*) AS count FROM leave_requests
      WHERE employee_id = ? GROUP BY status
    `).all(req.user.employeeId);
    const payroll = db.prepare(`
      SELECT month, net_salary AS netSalary, status FROM payrolls
      WHERE employee_id = ? ORDER BY month DESC LIMIT 6
    `).all(req.user.employeeId).reverse();
    return sendSuccess(res, {
      scope: 'SELF',
      attendance: attendance.reverse(),
      leaveSummary: leaves,
      payrollTrend: payroll,
      pendingTodos: leaves.find((item) => item.status === 'PENDING')?.count || 0,
    });
  }

  const organization = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM employees WHERE status = 'ACTIVE') AS totalActive,
      (SELECT COUNT(*) FROM departments WHERE status = 'ACTIVE') AS totalDepartments,
      (SELECT COUNT(*) FROM positions WHERE status = 'ACTIVE') AS totalPositions,
      (SELECT COUNT(*) FROM leave_requests WHERE status = 'PENDING') AS pendingApprovals,
      (SELECT COUNT(*) FROM employees WHERE substr(hire_date, 1, 7) = ?) AS thisMonthHires,
      (SELECT COUNT(*) FROM employees WHERE substr(leave_date, 1, 7) = ?) AS thisMonthLeaves
  `).get(currentMonth, currentMonth);

  const departmentDistribution = db.prepare(`
    SELECT d.id, d.name, COUNT(e.id) AS value
    FROM departments d
    LEFT JOIN employees e ON e.department_id = d.id AND e.status = 'ACTIVE'
    WHERE d.status = 'ACTIVE'
    GROUP BY d.id, d.name
    ORDER BY value DESC, d.id ASC
  `).all();

  const hires = db.prepare(`
    SELECT substr(hire_date, 1, 7) AS month, COUNT(*) AS count
    FROM employees WHERE substr(hire_date, 1, 7) >= ?
    GROUP BY substr(hire_date, 1, 7)
  `).all(firstMonth);
  const leaves = db.prepare(`
    SELECT substr(leave_date, 1, 7) AS month, COUNT(*) AS count
    FROM employees WHERE leave_date IS NOT NULL AND substr(leave_date, 1, 7) >= ?
    GROUP BY substr(leave_date, 1, 7)
  `).all(firstMonth);
  const hireMap = new Map(hires.map((item) => [item.month, item.count]));
  const leaveMap = new Map(leaves.map((item) => [item.month, item.count]));
  const trend = months.map((month) => ({ month, hires: hireMap.get(month) || 0, leaves: leaveMap.get(month) || 0 }));

  const leaveTypes = db.prepare(`
    SELECT type, COUNT(*) AS value FROM leave_requests
    WHERE status IN ('PENDING', 'APPROVED') GROUP BY type ORDER BY value DESC
  `).all();

  const payrollTrend = db.prepare(`
    SELECT month, ROUND(SUM(net_salary), 2) AS total
    FROM payrolls WHERE month >= ? GROUP BY month ORDER BY month ASC
  `).all(firstMonth);
  const payrollMap = new Map(payrollTrend.map((item) => [item.month, item.total]));
  const payrollMonthly = months.map((month) => ({ month, total: payrollMap.get(month) || 0 }));

  const pendingList = db.prepare(`
    SELECT lr.id, lr.type, lr.start_date AS startDate, lr.end_date AS endDate, lr.days,
           e.name AS employeeName, e.employee_no AS employeeNo
    FROM leave_requests lr
    JOIN employees e ON e.id = lr.employee_id
    WHERE lr.status = 'PENDING'
    ORDER BY lr.created_at ASC LIMIT 5
  `).all();

  return sendSuccess(res, {
    scope: 'ORGANIZATION',
    organization,
    departmentDistribution,
    trend,
    leaveTypes,
    payrollTrend: payrollMonthly,
    pendingList,
  });
}));

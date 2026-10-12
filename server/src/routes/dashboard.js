const express = require('express');
const db = require('../lib/db');
const { asyncHandler, monthOnly, toEmployee } = require('../lib/utils');

const router = express.Router();

function recentMonths(count = 6) {
  const months = [];
  const cursor = new Date();
  cursor.setUTCDate(1);
  cursor.setUTCMonth(cursor.getUTCMonth() - count + 1);
  while (months.length < count) {
    months.push(monthOnly(cursor));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
}

router.get('/', asyncHandler(async (req, res) => {
  if (req.user.role === 'employee') {
    const employeeId = req.user.employeeId;
    const employee = db.get(
      `SELECT e.*, d.name AS department_name, p.name AS position_name
       FROM employees e LEFT JOIN departments d ON d.id = e.department_id
       LEFT JOIN positions p ON p.id = e.position_id WHERE e.id = ?`,
      [employeeId]
    );
    const currentMonth = monthOnly();
    const attendance = db.get(
      `SELECT COUNT(*) AS total,
        SUM(CASE WHEN status = 'normal' THEN 1 ELSE 0 END) AS normal,
        SUM(CASE WHEN status = 'late' THEN 1 ELSE 0 END) AS late,
        SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) AS absent
       FROM attendance WHERE employee_id = ? AND substr(work_date, 1, 7) = ?`,
      [employeeId, currentMonth]
    );
    const leaveCount = db.get(
      `SELECT SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
              SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approved
       FROM leave_requests WHERE employee_id = ?`,
      [employeeId]
    );
    const payroll = db.get(
      `SELECT * FROM payrolls WHERE employee_id = ? AND status = 'issued' ORDER BY month DESC LIMIT 1`,
      [employeeId]
    );
    const months = recentMonths();
    const attendanceTrend = months.map((month) => {
      const row = db.get(
        `SELECT COUNT(*) AS days, SUM(CASE WHEN status = 'normal' THEN 1 ELSE 0 END) AS normal
         FROM attendance WHERE employee_id = ? AND substr(work_date, 1, 7) = ?`,
        [employeeId, month]
      );
      return { month, days: Number(row?.days || 0), normal: Number(row?.normal || 0) };
    });
    return res.json({
      success: true,
      data: {
        role: 'employee',
        employee: toEmployee(employee, req.user),
        attendance: attendance || {},
        leave: leaveCount || {},
        payroll,
        attendanceTrend
      }
    });
  }

  const totalEmployees = db.get(
    `SELECT COUNT(*) AS count FROM employees WHERE employment_status IN ('active', 'probation', 'leave')`
  ).count;
  const departmentDistribution = db.all(
    `SELECT d.name, COUNT(e.id) AS value
     FROM departments d LEFT JOIN employees e ON e.department_id = d.id
       AND e.employment_status IN ('active', 'probation', 'leave')
     GROUP BY d.id, d.name ORDER BY value DESC, d.sort_order ASC`
  );
  const months = recentMonths();
  const turnover = months.map((month) => ({
    month,
    hires: Number(db.get(`SELECT COUNT(*) AS count FROM employees WHERE substr(hire_date, 1, 7) = ?`, [month]).count),
    departures: Number(db.get(`SELECT COUNT(*) AS count FROM employees WHERE substr(termination_date, 1, 7) = ?`, [month]).count)
  }));
  const pending = {
    leave: Number(db.get(`SELECT COUNT(*) AS count FROM leave_requests WHERE status = 'pending'`).count),
    flows: Number(db.get(`SELECT COUNT(*) AS count FROM employee_flows WHERE status = 'pending'`).count),
    salary: Number(db.get(`SELECT COUNT(*) AS count FROM salary_adjustments WHERE status = 'pending'`).count)
  };
  const probationCount = Number(db.get(`SELECT COUNT(*) AS count FROM employees WHERE employment_status = 'probation'`).count);
  res.json({
    success: true,
    data: {
      role: req.user.role,
      cards: {
        totalEmployees,
        probationCount,
        pendingApprovals: pending.leave + pending.flows + pending.salary,
        currentMonthHires: turnover[months.length - 1].hires
      },
      departmentDistribution: departmentDistribution.map((row) => ({ name: row.name, value: Number(row.value) })),
      turnover,
      pending
    }
  });
}));

module.exports = router;

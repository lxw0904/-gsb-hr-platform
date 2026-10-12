const bcrypt = require('bcryptjs');
const db = require('./db');
const config = require('../config');
const { now, dateOnly, monthOnly } = require('./utils');

const departments = [
  [1, null, '集团总部', 'HQ', '顾思远', 1],
  [2, 1, '人力资源部', 'HR', '林晓', 10],
  [3, 1, '技术中心', 'TECH', '周睿', 20],
  [4, 3, '产品研发部', 'RND', '赵启明', 21],
  [5, 3, '基础架构部', 'INFRA', '孙博', 22],
  [6, 1, '市场部', 'MKT', '许晴', 30],
  [7, 1, '财务管理部', 'FIN', '韩梅', 40],
  [8, 6, '华东销售部', 'SALES-E', '陆航', 31]
];

const positions = [
  [1, 2, '人力资源业务伙伴', 'HRBP', 'P6', 3],
  [2, 3, '技术总监', 'CTO', 'M4', 1],
  [3, 4, '前端工程师', 'FE', 'P6', 5],
  [4, 4, '后端工程师', 'BE', 'P6', 8],
  [5, 4, '测试工程师', 'QA', 'P5', 4],
  [6, 5, '运维工程师', 'OPS', 'P6', 3],
  [7, 4, '产品经理', 'PM', 'P6', 3],
  [8, 6, '市场专员', 'MKT-S', 'P4', 5],
  [9, 8, '销售经理', 'SALES-M', 'P6', 6],
  [10, 7, '会计', 'ACC', 'P5', 3]
];

const employeeRows = [
  [1, 'GSB0001', '林晓', 'female', '1990-03-12', '13800001001', 'lin.xiao@gsb.local', '310101199003120026', '上海市浦东新区', '林建国', '13900001001', 2, 1, 2, '2021-04-12', null, null, 'active', 18000, '6222020200010001'],
  [2, 'GSB0002', '周睿', 'male', '1985-08-21', '13800001002', 'zhou.rui@gsb.local', '310101198508210031', '上海市徐汇区', '周敏', '13900001002', 3, 2, null, '2019-02-18', null, null, 'active', 42000, '6222020200010002'],
  [3, 'GSB0003', '陈默', 'male', '1995-11-06', '13800001003', 'chen.mo@gsb.local', '310101199511060035', '上海市杨浦区', '陈芳', '13900001003', 4, 3, 2, '2022-07-01', null, null, 'active', 24000, '6222020200010003'],
  [4, 'GSB0004', '赵启明', 'male', '1988-01-24', '13800001004', 'zhao.qiming@gsb.local', '310101198801240039', '上海市静安区', '赵磊', '13900001004', 4, 7, 2, '2020-05-11', null, null, 'active', 30000, '6222020200010004'],
  [5, 'GSB0005', '孙博', 'male', '1991-06-18', '13800001005', 'sun.bo@gsb.local', '310101199106180043', '上海市虹口区', '孙宁', '13900001005', 5, 6, 2, '2021-01-04', null, null, 'active', 27000, '6222020200010005'],
  [6, 'GSB0006', '许晴', 'female', '1993-09-30', '13800001006', 'xu.qing@gsb.local', '310101199309300048', '上海市长宁区', '许文', '13900001006', 6, 8, null, '2022-03-14', null, null, 'active', 19000, '6222020200010006'],
  [7, 'GSB0007', '韩梅', 'female', '1987-12-09', '13800001007', 'han.mei@gsb.local', '310101198712090052', '上海市普陀区', '韩立', '13900001007', 7, 10, null, '2020-10-19', null, null, 'active', 22000, '6222020200010007'],
  [8, 'GSB0008', '陆航', 'male', '1990-05-05', '13800001008', 'lu.hang@gsb.local', '310101199005050056', '上海市闵行区', '陆青', '13900001008', 8, 9, null, '2021-08-23', null, null, 'active', 21000, '6222020200010008'],
  [9, 'GSB0009', '苏婉', 'female', '1997-02-14', '13800001009', 'su.wan@gsb.local', '310101199702140060', '上海市浦东新区', '苏明', '13900001009', 4, 3, 3, '2024-09-02', null, null, 'active', 18500, '6222020200010009'],
  [10, 'GSB0010', '唐宇', 'male', '1996-07-26', '13800001010', 'tang.yu@gsb.local', '310101199607260064', '上海市宝山区', '唐丽', '13900001010', 4, 4, 3, '2024-11-18', null, null, 'active', 21000, '6222020200010010'],
  [11, 'GSB0011', '沈佳', 'female', '1998-04-03', '13800001011', 'shen.jia@gsb.local', '310101199804030068', '上海市松江区', '沈平', '13900001011', 4, 5, 4, '2025-12-01', '2026-06-01', null, 'probation', 15000, '6222020200010011'],
  [12, 'GSB0012', '顾凡', 'male', '1994-10-12', '13800001012', 'gu.fan@gsb.local', '310101199410120072', '上海市青浦区', '顾华', '13900001012', 5, 6, 5, '2023-06-06', null, null, 'active', 23000, '6222020200010012'],
  [13, 'GSB0013', '叶宁', 'female', '1999-01-19', '13800001013', 'ye.ning@gsb.local', '310101199901190076', '上海市嘉定区', '叶萍', '13900001013', 8, 9, 8, '2026-01-05', '2026-07-05', null, 'probation', 14000, '6222020200010013'],
  [14, 'GSB0014', '王远', 'male', '1992-03-28', '13800001014', 'wang.yuan@gsb.local', '310101199203280080', '上海市浦东新区', '王强', '13900001014', 4, 4, 3, '2023-03-20', null, '2025-12-31', 'terminated', 20000, '6222020200010014'],
  [15, 'GSB0015', '高洁', 'female', '1995-08-16', '13800001015', 'gao.jie@gsb.local', '310101199508160084', '上海市黄浦区', '高云', '13900001015', 6, 8, 6, '2025-05-08', null, null, 'active', 16000, '6222020200010015']
];

function dateMonthsAgo(months, day = 1) {
  const date = new Date();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - months);
  date.setUTCDate(day);
  return dateOnly(date);
}

function calculatePayroll(baseSalary, factor = 1) {
  const performance = Math.round(baseSalary * 0.12 * factor);
  const allowance = 800;
  const social = Math.round(baseSalary * 0.105 * 100) / 100;
  const fund = Math.round(baseSalary * 0.07 * 100) / 100;
  const taxable = Math.max(0, baseSalary + performance + allowance - social - fund - 5000);
  const tax = Math.round(taxable * 0.08 * 100) / 100;
  const net = Math.round((baseSalary + performance + allowance - social - fund - tax) * 100) / 100;
  return { performance, allowance, social, fund, tax, net };
}

async function seedDemoData(force = false) {
  const existing = db.get('SELECT COUNT(*) AS count FROM users');
  if (!force && existing?.count > 0) return false;

  const passwords = await Promise.all([
    bcrypt.hash('Admin@123', config.bcryptRounds),
    bcrypt.hash('Hr@123', config.bcryptRounds),
    bcrypt.hash('Employee@123', config.bcryptRounds)
  ]);

  db.transaction(() => {
    if (force) {
      db.exec(`
        DELETE FROM audit_logs;
        DELETE FROM employee_flows;
        DELETE FROM salary_adjustments;
        DELETE FROM payrolls;
        DELETE FROM leave_requests;
        DELETE FROM attendance;
        DELETE FROM users;
        DELETE FROM employees;
        DELETE FROM positions;
        DELETE FROM departments;
        DELETE FROM sqlite_sequence;
      `);
    }

    const timestamp = now();
    departments.forEach((row) => db.run(
      'INSERT INTO departments (id, parent_id, name, code, manager_name, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [...row, timestamp]
    ));
    positions.forEach((row) => db.run(
      'INSERT INTO positions (id, department_id, name, code, level, headcount, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [...row, timestamp]
    ));
    employeeRows.forEach((sourceRow) => {
      const row = [...sourceRow];
      const recentHires = { 9: [5, 2], 11: [3, 1], 13: [1, 5], 15: [4, 8] };
      if (recentHires[row[0]]) row[14] = dateMonthsAgo(recentHires[row[0]][0], recentHires[row[0]][1]);
      if (row[0] === 14) row[16] = dateMonthsAgo(2, 27);
      db.run(
        `INSERT INTO employees (
          id, employee_no, name, gender, birth_date, phone, email, id_card, address, emergency_contact,
          emergency_phone, department_id, position_id, manager_id, hire_date, probation_end_date,
          termination_date, employment_status, base_salary, bank_account, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [...row, timestamp, timestamp]
      );
    });

    [
      [1, 'admin', passwords[0], 'admin', 2, 'active'],
      [2, 'hr', passwords[1], 'hr', 1, 'active'],
      [3, 'employee', passwords[2], 'employee', 3, 'active']
    ].forEach((row) => db.run(
      `INSERT INTO users (id, username, password_hash, role, employee_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [...row, timestamp, timestamp]
    ));

    const today = new Date();
    const attendanceRows = [];
    for (let monthOffset = 0; monthOffset < 3; monthOffset += 1) {
      const cursor = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - monthOffset, 1));
      while (cursor.getUTCMonth() === ((today.getUTCMonth() - monthOffset + 12) % 12)) {
        const day = cursor.getUTCDay();
        if (day !== 0 && day !== 6) {
          const workDate = dateOnly(cursor);
          employeeRows.forEach((employee) => {
            if (employee[17] === 'terminated') return;
            const seed = employee[0] + cursor.getUTCDate();
            const status = seed % 17 === 0 ? 'late' : seed % 29 === 0 ? 'leave' : 'normal';
            const lateMinutes = status === 'late' ? 12 + (seed % 20) : 0;
            const checkIn = status === 'leave' ? null : `${String(8 + (lateMinutes > 0 ? 1 : 0)).padStart(2, '0')}:${String(lateMinutes).padStart(2, '0')}`;
            const checkOut = status === 'leave' ? null : `${String(18 + (seed % 2)).padStart(2, '0')}:${String((seed * 7) % 60).padStart(2, '0')}`;
            attendanceRows.push([
              employee[0], workDate, checkIn, checkOut, status,
              status === 'late' ? 0 : seed % 9 === 0 ? 1.5 : 0,
              status === 'late' ? '交通拥堵' : status === 'leave' ? '已审批请假' : '', timestamp
            ]);
          });
        }
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
    }
    attendanceRows.forEach((row) => db.run(
      `INSERT INTO attendance (employee_id, work_date, check_in, check_out, status, overtime_hours, remark, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      row
    ));

    for (let monthOffset = 2; monthOffset >= 0; monthOffset -= 1) {
      const month = dateMonthsAgo(monthOffset).slice(0, 7);
      employeeRows.forEach((employee) => {
        if (employee[17] === 'terminated' && month > '2025-12') return;
        const values = calculatePayroll(employee[18], 0.85 + ((employee[0] + monthOffset) % 4) * 0.08);
        db.run(
          `INSERT INTO payrolls (
            employee_id, month, base_salary, performance_bonus, allowance, social_insurance,
            housing_fund, tax, net_salary, status, generated_by, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'issued', 2, ?, ?)`,
          [employee[0], month, employee[18], values.performance, values.allowance, values.social, values.fund, values.tax, values.net, timestamp, timestamp]
        );
      });
    }

    db.run(
      `INSERT INTO leave_requests (employee_id, type, start_time, end_time, reason, status, submitted_at, created_at, updated_at)
       VALUES (3, 'annual', ?, ?, '家庭事务', 'pending', ?, ?, ?)`,
      [dateMonthsAgo(0, 18) + ' 09:00', dateMonthsAgo(0, 18) + ' 18:00', timestamp, timestamp, timestamp]
    );
    db.run(
      `INSERT INTO leave_requests (employee_id, type, start_time, end_time, reason, status, submitted_at, created_at, updated_at)
       VALUES (11, 'sick', ?, ?, '身体不适，需要就医休息', 'pending', ?, ?, ?)`,
      [dateMonthsAgo(0, 10) + ' 09:00', dateMonthsAgo(0, 11) + ' 18:00', timestamp, timestamp, timestamp]
    );
    db.run(
      `INSERT INTO leave_requests (employee_id, type, start_time, end_time, reason, status, approver_id, approval_comment, submitted_at, approved_at, created_at, updated_at)
       VALUES (9, 'personal', ?, ?, '办理个人证件', 'approved', 2, '已了解，同意', ?, ?, ?, ?)`,
      [dateMonthsAgo(1, 20) + ' 13:00', dateMonthsAgo(1, 20) + ' 18:00', timestamp, timestamp, timestamp, timestamp]
    );

    db.run(
      `INSERT INTO employee_flows (employee_id, type, status, from_department_id, to_department_id, from_position_id, to_position_id, effective_date, reason, submitted_by, created_at, updated_at)
       VALUES (9, 'transfer', 'pending', 4, 5, 3, 6, ?, '结合个人发展与团队需要调整岗位', 2, ?, ?)`,
      [dateMonthsAgo(0, 1), timestamp, timestamp]
    );
    db.run(
      `INSERT INTO employee_flows (employee_id, type, status, effective_date, reason, submitted_by, created_at, updated_at)
       VALUES (11, 'regularization', 'pending', ?, '试用期考核通过，建议转正', 2, ?, ?)`,
      [dateMonthsAgo(0, 1), timestamp, timestamp]
    );

    db.run(
      `INSERT INTO salary_adjustments (employee_id, old_salary, new_salary, effective_date, reason, status, submitted_by, created_at, updated_at)
       VALUES (10, 21000, 22500, ?, '年度绩效调薪', 'pending', 2, ?, ?)`,
      [dateMonthsAgo(0, 1), timestamp, timestamp]
    );

    db.run(
      `INSERT INTO audit_logs (user_id, username, action, resource, resource_id, detail, ip, created_at)
       VALUES (2, 'hr', 'GENERATE_PAYROLL', 'payroll', 'demo', ?, '127.0.0.1', ?)`,
      [JSON.stringify({ month: monthOnly(), count: employeeRows.length }), timestamp]
    );
  });

  return true;
}

module.exports = { seedDemoData, calculatePayroll };

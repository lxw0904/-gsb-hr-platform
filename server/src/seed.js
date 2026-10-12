import { db } from './db.js';
import { createSchema } from './schema.js';
import { hashPassword, encryptSensitive } from './security.js';

function dateMonthsAgo(months, day = 15) {
  const now = new Date();
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, 1));
  const maxDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, maxDay));
  return date.toISOString().slice(0, 10);
}

function monthKey(monthsAgo = 0) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 1)).toISOString().slice(0, 7);
}

export function clearDemoData() {
  db.exec('PRAGMA foreign_keys = OFF;');
  try {
    db.exec(`
      DELETE FROM audit_logs;
      DELETE FROM payrolls;
      DELETE FROM leave_requests;
      DELETE FROM attendance;
      DELETE FROM users;
      DELETE FROM employees;
      DELETE FROM positions;
      DELETE FROM departments;
      DELETE FROM settings;
      DELETE FROM sqlite_sequence;
    `);
  } finally {
    db.exec('PRAGMA foreign_keys = ON;');
  }
}

export function seedDemoData({ force = false } = {}) {
  createSchema();
  const count = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
  if (count > 0 && !force) return false;

  clearDemoData();

  const insertDepartment = db.prepare(`
    INSERT INTO departments (id, name, parent_id, manager_id, status, description) VALUES (?, ?, ?, ?, ?, ?)
  `);
  const departments = [
    [1, '总经办', null, null, 'ACTIVE', '负责公司经营管理与战略决策'],
    [2, '人力资源部', 1, null, 'ACTIVE', '负责招聘、薪酬、绩效与员工关系'],
    [3, '产品研发部', 1, null, 'ACTIVE', '负责产品规划和技术研发'],
    [4, '市场与销售部', 1, null, 'ACTIVE', '负责品牌、市场增长和客户拓展'],
    [5, '前端研发组', 3, null, 'ACTIVE', '负责 Web 与移动端产品研发'],
    [6, '后端研发组', 3, null, 'ACTIVE', '负责服务端、数据和基础设施'],
    [7, '产品设计组', 3, null, 'ACTIVE', '负责产品设计与用户研究'],
  ];
  for (const row of departments) insertDepartment.run(...row);

  const insertPosition = db.prepare(`
    INSERT INTO positions (id, name, department_id, level, status, description) VALUES (?, ?, ?, ?, ?, ?)
  `);
  const positions = [
    [1, '总经理', 1, 'M5', 'ACTIVE', '公司经营管理第一责任人'],
    [2, '人力资源经理', 2, 'M3', 'ACTIVE', '统筹人力资源管理工作'],
    [3, 'HR 专员', 2, 'P3', 'ACTIVE', '负责员工关系与日常人事运营'],
    [4, '产品经理', 7, 'P3', 'ACTIVE', '负责产品规划与需求管理'],
    [5, '前端工程师', 5, 'P3', 'ACTIVE', '负责前端产品研发'],
    [6, '后端工程师', 6, 'P3', 'ACTIVE', '负责服务端研发'],
    [7, '市场专员', 4, 'P2', 'ACTIVE', '负责市场活动与内容运营'],
    [8, '销售经理', 4, 'M2', 'ACTIVE', '负责销售目标与客户管理'],
  ];
  for (const row of positions) insertPosition.run(...row);

  const insertEmployee = db.prepare(`
    INSERT INTO employees (
      id, employee_no, name, gender, birth_date, id_card, phone, email, address,
      emergency_contact, emergency_phone, department_id, position_id, hire_date, leave_date,
      status, base_salary
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const employeeRows = [
    [1, 'E001', '张伟', 'MALE', '1979-05-18', '110101197905180011', '13800000001', 'zhangwei@example.local', '北京市朝阳区', '张女士', '13900000001', 1, 1, dateMonthsAgo(92, 8), null, 'ACTIVE', 32000],
    [2, 'E002', '李娜', 'FEMALE', '1988-09-12', '110101198809120022', '13800000002', 'lina@example.local', '北京市海淀区', '李先生', '13900000002', 2, 2, dateMonthsAgo(70, 10), null, 'ACTIVE', 22000],
    [3, 'E003', '王强', 'MALE', '1995-02-24', '110101199502240033', '13800000003', 'wangqiang@example.local', '北京市昌平区', '王女士', '13900000003', 5, 5, dateMonthsAgo(46, 12), null, 'ACTIVE', 18000],
    [4, 'E004', '赵敏', 'FEMALE', '1993-11-07', '110101199311070044', '13800000004', 'zhaomin@example.local', '北京市丰台区', '赵先生', '13900000004', 6, 6, dateMonthsAgo(58, 16), null, 'ACTIVE', 19500],
    [5, 'E005', '陈晨', 'FEMALE', '1997-06-15', '110101199706150055', '13800000005', 'chenchen@example.local', '北京市通州区', '陈女士', '13900000005', 4, 8, dateMonthsAgo(34, 5), null, 'ACTIVE', 13500],
    [6, 'E006', '刘洋', 'MALE', '1991-03-29', '110101199103290066', '13800000006', 'liuyang@example.local', '北京市西城区', '刘女士', '13900000006', 7, 4, dateMonthsAgo(44, 20), null, 'ACTIVE', 21000],
    [7, 'E007', '周洁', 'FEMALE', '1996-12-02', '110101199612020077', '13800000007', 'zhoujie@example.local', '北京市朝阳区', '周先生', '13900000007', 2, 3, dateMonthsAgo(22, 8), null, 'ACTIVE', 11000],
    [8, 'E008', '吴磊', 'MALE', '1994-08-19', '110101199408190088', '13800000008', 'wulei@example.local', '北京市石景山区', '吴女士', '13900000008', 6, 6, dateMonthsAgo(29, 11), null, 'ACTIVE', 17500],
    [9, 'E009', '林悦', 'FEMALE', '1998-01-30', '110101199801300099', '13800000009', 'linyue@example.local', '北京市海淀区', '林先生', '13900000009', 5, 5, dateMonthsAgo(5, 8), null, 'ACTIVE', 16000],
    [10, 'E010', '孙浩', 'MALE', '1999-04-16', '110101199904160101', '13800000010', 'sunhao@example.local', '北京市大兴区', '孙女士', '13900000010', 5, 5, dateMonthsAgo(3, 12), null, 'ACTIVE', 15500],
    [11, 'E011', '郑欣', 'FEMALE', '1997-10-11', '110101199710110111', '13800000011', 'zhengxin@example.local', '北京市东城区', '郑先生', '13900000011', 4, 7, dateMonthsAgo(18, 6), null, 'ACTIVE', 12000],
    [12, 'E012', '何凯', 'MALE', '1992-07-25', '110101199207250122', '13800000012', 'hekai@example.local', '北京市顺义区', '何女士', '13900000012', 6, 6, dateMonthsAgo(2, 3), null, 'ACTIVE', 17000],
    [13, 'E013', '马莉', 'FEMALE', '1990-05-09', '110101199005090133', '13800000013', 'mali@example.local', '北京市海淀区', '马先生', '13900000013', 2, 3, dateMonthsAgo(57, 10), dateMonthsAgo(4, 28), 'LEFT', 10000],
    [14, 'E014', '高远', 'MALE', '1991-09-03', '110101199109030144', '13800000014', 'gaoyuan@example.local', '北京市朝阳区', '高女士', '13900000014', 7, 4, dateMonthsAgo(16, 18), dateMonthsAgo(2, 26), 'LEFT', 14500],
  ];
  for (const row of employeeRows) {
    const encryptedId = encryptSensitive(row[5]);
    insertEmployee.run(...row.slice(0, 5), encryptedId, ...row.slice(6));
  }

  const insertUser = db.prepare(`
    INSERT INTO users (id, username, password_hash, role, employee_id, is_active)
    VALUES (?, ?, ?, ?, ?, 1)
  `);
  const users = [
    [1, 'admin', 'admin123', 'ADMIN', 1],
    [2, 'hr', 'hr123', 'HR', 2],
    [3, 'employee', 'employee123', 'EMPLOYEE', 3],
  ];
  for (const [id, username, password, role, employeeId] of users) {
    insertUser.run(id, username, hashPassword(password), role, employeeId);
  }

  const insertAttendance = db.prepare(`
    INSERT INTO attendance (employee_id, month, work_days, actual_days, late_count, absent_days, overtime_hours, status, remark)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const activeEmployees = employeeRows.filter((row) => row[15] === 'ACTIVE');
  for (let m = 0; m <= 2; m += 1) {
    activeEmployees.forEach((row, index) => {
      const late = (index + m) % 5 === 0 ? 2 : (index + m) % 3 === 0 ? 1 : 0;
      const absent = (index + m) % 7 === 0 ? 1 : 0;
      const overtime = ((index * 2 + m) % 8) * 1.5;
      const workDays = 21.75;
      insertAttendance.run(
        row[0], monthKey(m), workDays, workDays - absent - (late ? 0.5 : 0), late, absent, overtime,
        late > 1 || absent > 0 ? 'ATTENTION' : 'NORMAL',
        absent > 0 ? '有缺勤记录，请确认原因' : '',
      );
    });
  }

  const insertLeave = db.prepare(`
    INSERT INTO leave_requests (employee_id, type, start_date, end_date, days, reason, status, approver_id, approved_at, comment, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const leaveRows = [
    [3, 'ANNUAL', dateMonthsAgo(0, 22), dateMonthsAgo(0, 23), 2, '家庭事务安排', 'PENDING', null, null, '', dateMonthsAgo(0, 18)],
    [5, 'SICK', dateMonthsAgo(0, 12), dateMonthsAgo(0, 12), 1, '身体不适就医', 'PENDING', null, null, '', dateMonthsAgo(0, 11)],
    [8, 'PERSONAL', dateMonthsAgo(1, 12), dateMonthsAgo(1, 13), 2, '办理个人事务', 'APPROVED', 2, dateMonthsAgo(1, 9), '已安排工作交接', dateMonthsAgo(1, 5)],
    [9, 'ANNUAL', dateMonthsAgo(2, 8), dateMonthsAgo(2, 10), 3, '年度休假', 'APPROVED', 2, dateMonthsAgo(2, 4), '同意', dateMonthsAgo(2, 1)],
    [4, 'OTHER', dateMonthsAgo(2, 18), dateMonthsAgo(2, 18), 1, '参加行业会议', 'REJECTED', 2, dateMonthsAgo(2, 15), '当月项目交付冲突', dateMonthsAgo(2, 13)],
    [10, 'SICK', dateMonthsAgo(1, 20), dateMonthsAgo(1, 20), 1, '感冒发烧', 'DRAFT', null, null, '', dateMonthsAgo(1, 20)],
  ];
  for (const row of leaveRows) insertLeave.run(...row);

  const insertPayroll = db.prepare(`
    INSERT INTO payrolls (employee_id, month, base_salary, performance_bonus, social_security, tax, deduction, net_salary, status, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (let m = 0; m <= 2; m += 1) {
    activeEmployees.forEach((row, index) => {
      const base = Number(row[16]);
      const bonus = Math.round(base * (0.08 + ((index + m) % 4) * 0.02));
      const social = Math.round(base * 0.105);
      const taxable = Math.max(0, base + bonus - social - 5000);
      const tax = Math.round(taxable * 0.03);
      const deduction = (index + m) % 9 === 0 ? 200 : 0;
      const net = base + bonus - social - tax - deduction;
      const status = m === 0 ? 'DRAFT' : 'PAID';
      insertPayroll.run(row[0], monthKey(m), base, bonus, social, tax, deduction, net, status, 2, `${monthKey(m)}-25 09:00:00`);
    });
  }

  db.prepare(`INSERT INTO settings (key, value) VALUES ('demo_seeded_at', ?)`).run(new Date().toISOString());
  db.prepare(`
    INSERT INTO audit_logs (user_id, username, role, action, target_type, target_id, detail, ip)
    VALUES (1, 'admin', 'ADMIN', 'SYSTEM_SEED', 'SYSTEM', 'demo', ?, 'local')
  `).run(JSON.stringify({ employees: employeeRows.length, note: '演示数据初始化' }));

  return true;
}





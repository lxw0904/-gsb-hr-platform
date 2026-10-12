const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const config = require('../config');

let database;
let readyPromise;

const schema = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS departments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id INTEGER,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  manager_name TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (parent_id) REFERENCES departments(id)
);

CREATE TABLE IF NOT EXISTS positions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  department_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  level TEXT,
  headcount INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (department_id) REFERENCES departments(id)
);

CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_no TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  gender TEXT NOT NULL DEFAULT 'unknown',
  birth_date TEXT,
  phone TEXT,
  email TEXT,
  id_card TEXT,
  address TEXT,
  emergency_contact TEXT,
  emergency_phone TEXT,
  department_id INTEGER,
  position_id INTEGER,
  manager_id INTEGER,
  hire_date TEXT NOT NULL,
  probation_end_date TEXT,
  termination_date TEXT,
  employment_status TEXT NOT NULL DEFAULT 'probation',
  base_salary REAL NOT NULL DEFAULT 0,
  bank_account TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (department_id) REFERENCES departments(id),
  FOREIGN KEY (position_id) REFERENCES positions(id),
  FOREIGN KEY (manager_id) REFERENCES employees(id)
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'hr', 'employee')),
  employee_id INTEGER,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  last_login_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (employee_id) REFERENCES employees(id)
);

CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  work_date TEXT NOT NULL,
  check_in TEXT,
  check_out TEXT,
  status TEXT NOT NULL DEFAULT 'normal' CHECK (status IN ('normal', 'late', 'early_leave', 'absent', 'leave', 'overtime')),
  overtime_hours REAL NOT NULL DEFAULT 0,
  remark TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (employee_id, work_date),
  FOREIGN KEY (employee_id) REFERENCES employees(id)
);

CREATE TABLE IF NOT EXISTS leave_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'approved', 'rejected', 'cancelled')),
  approver_id INTEGER,
  approval_comment TEXT,
  submitted_at TEXT,
  approved_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (employee_id) REFERENCES employees(id),
  FOREIGN KEY (approver_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS payrolls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  month TEXT NOT NULL,
  base_salary REAL NOT NULL DEFAULT 0,
  performance_bonus REAL NOT NULL DEFAULT 0,
  allowance REAL NOT NULL DEFAULT 0,
  social_insurance REAL NOT NULL DEFAULT 0,
  housing_fund REAL NOT NULL DEFAULT 0,
  tax REAL NOT NULL DEFAULT 0,
  net_salary REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued')),
  generated_by INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (employee_id, month),
  FOREIGN KEY (employee_id) REFERENCES employees(id),
  FOREIGN KEY (generated_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS salary_adjustments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  old_salary REAL NOT NULL,
  new_salary REAL NOT NULL,
  effective_date TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  submitted_by INTEGER NOT NULL,
  approved_by INTEGER,
  comment TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (employee_id) REFERENCES employees(id),
  FOREIGN KEY (submitted_by) REFERENCES users(id),
  FOREIGN KEY (approved_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS employee_flows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('transfer', 'regularization')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  from_department_id INTEGER,
  to_department_id INTEGER,
  from_position_id INTEGER,
  to_position_id INTEGER,
  effective_date TEXT NOT NULL,
  reason TEXT NOT NULL,
  submitted_by INTEGER NOT NULL,
  approved_by INTEGER,
  comment TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (employee_id) REFERENCES employees(id),
  FOREIGN KEY (to_department_id) REFERENCES departments(id),
  FOREIGN KEY (to_position_id) REFERENCES positions(id),
  FOREIGN KEY (submitted_by) REFERENCES users(id),
  FOREIGN KEY (approved_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  username TEXT NOT NULL,
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  resource_id TEXT,
  detail TEXT,
  ip TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_employees_department ON employees(department_id);
CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(employment_status);
CREATE INDEX IF NOT EXISTS idx_attendance_employee_date ON attendance(employee_id, work_date);
CREATE INDEX IF NOT EXISTS idx_leaves_employee_status ON leave_requests(employee_id, status);
CREATE INDEX IF NOT EXISTS idx_payroll_employee_month ON payrolls(employee_id, month);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
`;

function persist() {
  if (!database) return;
  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
  const bytes = Buffer.from(database.export());
  const tempPath = `${config.dbPath}.tmp`;
  fs.writeFileSync(tempPath, bytes);
  fs.renameSync(tempPath, config.dbPath);
}

async function initialize() {
  const SQL = await initSqlJs({ locateFile: () => require.resolve('sql.js/dist/sql-wasm.wasm') });
  if (fs.existsSync(config.dbPath)) {
    database = new SQL.Database(fs.readFileSync(config.dbPath));
  } else {
    database = new SQL.Database();
  }
  database.exec(schema);
  persist();
  return database;
}

function ready() {
  if (!readyPromise) readyPromise = initialize();
  return readyPromise;
}

function all(sql, params = []) {
  const statement = database.prepare(sql);
  try {
    statement.bind(params);
    const rows = [];
    while (statement.step()) rows.push(statement.getAsObject());
    return rows;
  } finally {
    statement.free();
  }
}

function get(sql, params = []) {
  return all(sql, params)[0] || null;
}

function run(sql, params = [], shouldPersist = false) {
  const statement = database.prepare(sql);
  try {
    statement.bind(params);
    statement.step();
  } finally {
    statement.free();
  }
  const result = get('SELECT last_insert_rowid() AS id, changes() AS changes');
  if (shouldPersist) persist();
  return result;
}

function exec(sql) {
  database.exec(sql);
}

function transaction(callback) {
  database.exec('BEGIN');
  try {
    const result = callback();
    database.exec('COMMIT');
    persist();
    return result;
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

function replaceDatabase() {
  database.close();
  database = null;
  readyPromise = null;
  return ready();
}

module.exports = { ready, all, get, run, exec, transaction, persist, replaceDatabase };

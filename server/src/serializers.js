import { decryptSensitive, maskIdCard } from './security.js';
import { ROLES } from './middleware.js';

export function serializeEmployee(row, viewerRole, viewerEmployeeId = null, options = {}) {
  if (!row) return null;
  const isSelf = viewerEmployeeId != null && Number(viewerEmployeeId) === Number(row.id);
  const canSeeSensitive = [ROLES.ADMIN, ROLES.HR].includes(viewerRole) || isSelf;
  const includeMasked = options.includeMasked === true;
  const idCard = canSeeSensitive ? decryptSensitive(row.id_card) : '';
  return {
    id: row.id,
    employeeNo: row.employee_no,
    name: row.name,
    gender: row.gender,
    birthDate: row.birth_date,
    idCard: canSeeSensitive ? idCard : (includeMasked ? maskIdCard(decryptSensitive(row.id_card)) : undefined),
    phone: row.phone,
    email: row.email,
    address: row.address,
    emergencyContact: row.emergency_contact,
    emergencyPhone: row.emergency_phone,
    departmentId: row.department_id,
    departmentName: row.department_name || row.departmentName || '',
    positionId: row.position_id,
    positionName: row.position_name || row.positionName || '',
    positionLevel: row.position_level || row.positionLevel || '',
    hireDate: row.hire_date,
    leaveDate: row.leave_date,
    status: row.status,
    baseSalary: canSeeSensitive ? Number(row.base_salary || 0) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function serializeUser(row) {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    employeeId: row.employee_id,
    employeeName: row.employee_name || '',
    employeeNo: row.employee_no || '',
    departmentName: row.department_name || '',
    isActive: Boolean(row.is_active),
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
  };
}

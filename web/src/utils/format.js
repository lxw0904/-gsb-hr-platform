export const GENDER_LABELS = { MALE: '男', FEMALE: '女', OTHER: '其他' };
export const EMPLOYEE_STATUS_LABELS = { ACTIVE: '在职', LEFT: '离职' };
export const ORG_STATUS_LABELS = { ACTIVE: '启用', INACTIVE: '停用' };
export const LEAVE_TYPE_LABELS = {
  ANNUAL: '年假', SICK: '病假', PERSONAL: '事假', MATERNITY: '产假', MARRIAGE: '婚假', OTHER: '其他',
};
export const LEAVE_STATUS_LABELS = {
  DRAFT: '草稿', PENDING: '待审批', APPROVED: '已通过', REJECTED: '已驳回', CANCELLED: '已取消',
};
export const PAYROLL_STATUS_LABELS = { DRAFT: '草稿', CONFIRMED: '已确认', PAID: '已发放' };
export const ATTENDANCE_STATUS_LABELS = { NORMAL: '正常', ATTENTION: '需关注' };
export const ROLE_LABELS = { ADMIN: '管理员', HR: 'HR', EMPLOYEE: '普通员工' };
export const USER_STATUS_LABELS = { ACTIVE: '启用', DISABLED: '停用' };

export function formatDate(value) {
  if (!value) return '—';
  return String(value).slice(0, 10);
}

export function formatDateTime(value) {
  if (!value) return '—';
  return String(value).replace('T', ' ').slice(0, 19);
}

export function formatMoney(value) {
  const amount = Number(value || 0);
  return `¥ ${amount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function labelOf(map, value) {
  return map[value] || value || '—';
}

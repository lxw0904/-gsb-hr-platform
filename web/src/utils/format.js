export const roleLabels = { admin: '管理员', hr: 'HR', employee: '员工' }
export const statusLabels = {
  active: '在职', probation: '试用期', leave: '休假中', terminated: '已离职',
  draft: '草稿', pending: '待审批', approved: '已通过', rejected: '已驳回', cancelled: '已撤销', issued: '已发放',
  normal: '正常', late: '迟到', early_leave: '早退', absent: '缺勤',
  transfer: '调岗', regularization: '转正', disabled: '已停用'
}
export const statusTypes = {
  active: 'success', probation: 'warning', leave: 'info', terminated: 'danger',
  draft: 'info', pending: 'warning', approved: 'success', rejected: 'danger', cancelled: 'info', issued: 'success',
  normal: 'success', late: 'warning', early_leave: 'warning', absent: 'danger',
  transfer: 'primary', regularization: 'success', disabled: 'danger'
}
export const leaveTypeLabels = { annual: '年假', sick: '病假', personal: '事假', marriage: '婚假', maternity: '产假', compensatory: '调休' }

export function formatDate(value, withTime = false) {
  if (!value) return '-'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', withTime
    ? { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }
    : { year: 'numeric', month: '2-digit', day: '2-digit' }).format(parsed)
}

export function formatMoney(value) {
  const number = Number(value || 0)
  return `¥ ${number.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function genderLabel(value) {
  return { male: '男', female: '女', unknown: '未设置' }[value] || '未设置'
}

export function actionLabel(value) {
  const labels = {
    LOGIN: '登录系统', CREATE_DEPARTMENT: '新建部门', UPDATE_DEPARTMENT: '更新部门', DELETE_DEPARTMENT: '删除部门',
    CREATE_POSITION: '新建职位', UPDATE_POSITION: '更新职位', DELETE_POSITION: '删除职位',
    CREATE_EMPLOYEE: '新建员工', UPDATE_EMPLOYEE: '更新员工', TERMINATE_EMPLOYEE: '办理离职', IMPORT_EMPLOYEES: '导入员工', EXPORT_EMPLOYEES: '导出员工',
    SUBMIT_LEAVE: '提交请假', CREATE_LEAVE_DRAFT: '保存请假草稿', UPDATE_LEAVE_DRAFT: '编辑请假草稿', CANCEL_LEAVE: '撤销请假',
    DELETE_LEAVE_DRAFT: '删除请假草稿', APPROVE_LEAVE: '通过请假', REJECT_LEAVE: '驳回请假', BATCH_APPROVE_LEAVE: '批量通过请假', BATCH_REJECT_LEAVE: '批量驳回请假',
    SUBMIT_TRANSFER: '提交调岗', SUBMIT_REGULARIZATION: '提交转正', APPROVE_EMPLOYEE_FLOW: '通过人事流程', REJECT_EMPLOYEE_FLOW: '驳回人事流程',
    SUBMIT_SALARY_ADJUSTMENT: '提交调薪', APPROVE_SALARY_ADJUSTMENT: '通过调薪', REJECT_SALARY_ADJUSTMENT: '驳回调薪',
    GENERATE_PAYROLL: '生成工资单', UPDATE_PAYROLL: '修改工资单', ISSUE_PAYROLL: '发放工资单', DELETE_PAYROLL: '删除工资单',
    CREATE_USER: '新建账号', UPDATE_USER: '更新权限', RESET_USER_PASSWORD: '重置密码', DELETE_USER: '删除账号', CHANGE_PASSWORD: '修改密码', UPDATE_PROFILE: '更新个人资料'
  }
  return labels[value] || value
}

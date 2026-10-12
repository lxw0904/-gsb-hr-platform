import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { getToken } from '../api/http'

const routes = [
  { path: '/login', name: 'login', component: () => import('../views/LoginView.vue'), meta: { public: true } },
  {
    path: '/',
    component: () => import('../layouts/AppLayout.vue'),
    children: [
      { path: '', redirect: '/dashboard' },
      { path: 'dashboard', name: 'dashboard', component: () => import('../views/DashboardView.vue'), meta: { title: '工作台' } },
      { path: 'organization', name: 'organization', component: () => import('../views/OrganizationView.vue'), meta: { title: '组织架构', roles: ['admin', 'hr'] } },
      { path: 'employees', name: 'employees', component: () => import('../views/EmployeesView.vue'), meta: { title: '员工档案', roles: ['admin', 'hr'] } },
      { path: 'attendance', name: 'attendance', component: () => import('../views/AttendanceView.vue'), meta: { title: '考勤管理' } },
      { path: 'leave', name: 'leave', component: () => import('../views/LeaveView.vue'), meta: { title: '请假申请' } },
      { path: 'payroll', name: 'payroll', component: () => import('../views/PayrollView.vue'), meta: { title: '薪酬管理' } },
      { path: 'approvals', name: 'approvals', component: () => import('../views/ApprovalsView.vue'), meta: { title: '审批中心', roles: ['admin', 'hr'] } },
      { path: 'profile', name: 'profile', component: () => import('../views/ProfileView.vue'), meta: { title: '个人中心' } },
      { path: 'system/users', name: 'system-users', component: () => import('../views/UsersView.vue'), meta: { title: '用户与角色', roles: ['admin'] } },
      { path: 'system/audit', name: 'system-audit', component: () => import('../views/AuditLogsView.vue'), meta: { title: '审计日志', roles: ['admin'] } },
      { path: 'system/settings', name: 'system-settings', component: () => import('../views/SystemView.vue'), meta: { title: '系统设置', roles: ['admin'] } },
      { path: '403', name: 'forbidden', component: () => import('../views/ForbiddenView.vue'), meta: { title: '无权访问' } },
      { path: ':pathMatch(.*)*', name: 'not-found', component: () => import('../views/NotFoundView.vue'), meta: { title: '页面不存在' } }
    ]
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 })
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  if (!auth.token) auth.token = getToken()
  document.title = to.meta.title ? `${to.meta.title} - GSB HR` : 'GSB 人力资源平台'
  if (to.meta.public) {
    if (to.name === 'login' && auth.token) return '/dashboard'
    return true
  }
  if (!auth.token) return { name: 'login', query: { redirect: to.fullPath } }
  if (!auth.user) {
    try {
      await auth.fetchMe()
    } catch {
      auth.logout()
      return { name: 'login', query: { redirect: to.fullPath } }
    }
  }
  if (to.meta.roles && !to.meta.roles.includes(auth.user.role)) return { name: 'forbidden' }
  return true
})

export default router

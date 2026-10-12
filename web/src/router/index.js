import { createRouter, createWebHistory } from 'vue-router';
import { authStore } from '../stores/auth.js';
import AppLayout from '../layouts/AppLayout.vue';

const routes = [
  { path: '/login', name: 'login', component: () => import('../views/LoginView.vue'), meta: { public: true, title: '登录' } },
  {
    path: '/',
    component: AppLayout,
    redirect: '/dashboard',
    children: [
      { path: 'dashboard', name: 'dashboard', component: () => import('../views/DashboardView.vue'), meta: { title: '工作台' } },
      { path: 'employees', name: 'employees', component: () => import('../views/EmployeesView.vue'), meta: { title: '员工档案', roles: ['ADMIN', 'HR'] } },
      { path: 'departments', name: 'departments', component: () => import('../views/DepartmentsView.vue'), meta: { title: '部门组织', roles: ['ADMIN', 'HR'] } },
      { path: 'positions', name: 'positions', component: () => import('../views/PositionsView.vue'), meta: { title: '职位管理', roles: ['ADMIN', 'HR'] } },
      { path: 'profile', name: 'profile', component: () => import('../views/ProfileView.vue'), meta: { title: '我的档案' } },
      { path: 'attendance', name: 'attendance', component: () => import('../views/AttendanceView.vue'), meta: { title: '考勤管理' } },
      { path: 'leaves', name: 'leaves', component: () => import('../views/LeavesView.vue'), meta: { title: '请假与审批' } },
      { path: 'payrolls', name: 'payrolls', component: () => import('../views/PayrollView.vue'), meta: { title: '薪酬管理' } },
      { path: 'users', name: 'users', component: () => import('../views/UsersView.vue'), meta: { title: '用户与角色', roles: ['ADMIN'] } },
      { path: 'audit-logs', name: 'audit-logs', component: () => import('../views/AuditLogsView.vue'), meta: { title: '审计日志', roles: ['ADMIN'] } },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/dashboard' },
];

const router = createRouter({ history: createWebHistory(), routes });

router.beforeEach(async (to) => {
  if (!authStore.state.ready) await authStore.hydrate();
  if (to.meta.public) {
    if (authStore.isLoggedIn.value && to.name === 'login') return '/dashboard';
    return true;
  }
  if (!authStore.isLoggedIn.value) return { name: 'login', query: { redirect: to.fullPath } };
  if (to.meta.roles?.length && !to.meta.roles.includes(authStore.state.user?.role)) return '/dashboard';
  return true;
});

router.afterEach((to) => {
  document.title = `${to.meta.title || '工作台'} · 澄明 HR`;
});

export default router;

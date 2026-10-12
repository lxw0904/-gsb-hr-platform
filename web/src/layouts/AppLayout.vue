<template>
  <div class="app-shell">
    <aside class="sidebar" :class="{ collapsed }">
      <div class="brand" @click="router.push('/dashboard')">
        <div class="brand-mark">GSB</div>
        <div v-show="!collapsed" class="brand-copy">
          <strong>HR Platform</strong>
          <span>人力资源管理平台</span>
        </div>
      </div>
      <el-menu :default-active="route.path" :collapse="collapsed && !mobile" router class="side-menu">
        <el-menu-item v-for="item in menus" :key="item.path" :index="item.path">
          <span class="menu-icon">{{ item.icon }}</span>
          <template #title>{{ item.label }}</template>
        </el-menu-item>
      </el-menu>
      <div v-show="!collapsed" class="sidebar-foot">
        <span class="online-dot"></span>
        <div><strong>本地服务正常</strong><small>数据存储于本机 SQLite</small></div>
      </div>
    </aside>

    <div class="main-area">
      <header class="topbar">
        <div class="topbar-left">
          <button class="collapse-btn" @click="toggleCollapse" aria-label="切换菜单">
            {{ collapsed ? '☰' : '‹' }}
          </button>
          <div>
            <strong>{{ route.meta.title || '工作台' }}</strong>
            <span class="topbar-date">{{ todayText }}</span>
          </div>
        </div>
        <div class="topbar-actions">
          <button class="todo-button" @click="goTodo">
            <span class="bell">◉</span>
            <span class="desktop-only">待办提醒</span>
            <span v-if="todoCount > 0" class="todo-badge">{{ todoCount > 99 ? '99+' : todoCount }}</span>
          </button>
          <el-dropdown trigger="click" @command="handleCommand">
            <button class="user-button">
              <el-avatar :size="34">{{ avatarText }}</el-avatar>
              <span class="user-copy desktop-only">
                <strong>{{ auth.user?.employeeName || auth.user?.username }}</strong>
                <small>{{ roleLabels[auth.user?.role] }}</small>
              </span>
              <span class="chevron">⌄</span>
            </button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="profile">个人中心</el-dropdown-item>
                <el-dropdown-item command="logout" divided>退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </header>

      <main class="page-content">
        <router-view />
      </main>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { useAuthStore } from '../stores/auth'
import { api } from '../api/http'
import { roleLabels } from '../utils/format'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const collapsed = ref(false)
const mobile = ref(window.innerWidth < 860)
const todoCount = ref(0)

const allMenus = [
  { path: '/dashboard', label: '工作台', icon: '◫', roles: ['admin', 'hr', 'employee'] },
  { path: '/organization', label: '组织架构', icon: '⌘', roles: ['admin', 'hr'] },
  { path: '/employees', label: '员工档案', icon: '◉', roles: ['admin', 'hr'] },
  { path: '/attendance', label: '考勤管理', icon: '▦', roles: ['admin', 'hr', 'employee'] },
  { path: '/leave', label: '请假申请', icon: '✎', roles: ['admin', 'hr', 'employee'] },
  { path: '/payroll', label: '薪酬管理', icon: '¥', roles: ['admin', 'hr', 'employee'] },
  { path: '/approvals', label: '审批中心', icon: '✓', roles: ['admin', 'hr'] },
  { path: '/profile', label: '个人中心', icon: '☺', roles: ['admin', 'hr', 'employee'] },
  { path: '/system/users', label: '用户与角色', icon: '♧', roles: ['admin'] },
  { path: '/system/audit', label: '审计日志', icon: '◷', roles: ['admin'] },
  { path: '/system/settings', label: '系统设置', icon: '⚙', roles: ['admin'] }
]

const menus = computed(() => allMenus.filter((item) => item.roles.includes(auth.user?.role)))
const avatarText = computed(() => (auth.user?.employeeName || auth.user?.username || 'U').slice(0, 1))
const todayText = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date())

function toggleCollapse() {
  collapsed.value = !collapsed.value
}

function onResize() {
  mobile.value = window.innerWidth < 860
  if (mobile.value) collapsed.value = true
}

async function loadTodos() {
  try {
    const data = await api.get('/dashboard', null, { silent: true })
    todoCount.value = auth.user?.role === 'employee'
      ? Number(data.leave?.pending || 0)
      : Number(data.cards?.pendingApprovals || 0)
  } catch {
    todoCount.value = 0
  }
}

function goTodo() {
  router.push(auth.user?.role === 'employee' ? '/leave' : '/approvals')
}

async function handleCommand(command) {
  if (command === 'profile') return router.push('/profile')
  if (command === 'logout') {
    try {
      await ElMessageBox.confirm('确认退出当前账号吗？', '退出登录', { type: 'warning', confirmButtonText: '退出', cancelButtonText: '取消' })
      auth.logout()
      router.replace('/login')
    } catch {}
  }
}

onMounted(() => {
  onResize()
  loadTodos()
  window.addEventListener('resize', onResize)
})
onBeforeUnmount(() => window.removeEventListener('resize', onResize))
</script>

<style scoped>
.app-shell { display: flex; min-height: 100vh; background: var(--page); }
.sidebar {
  position: sticky; top: 0; z-index: 20; display: flex; flex-direction: column; width: 238px; height: 100vh;
  padding: 18px 14px; background: #111c31; color: #d9e2f3; transition: width .24s ease;
}
.sidebar.collapsed { width: 76px; }
.brand { display: flex; align-items: center; gap: 11px; height: 52px; padding: 0 7px 14px; cursor: pointer; }
.brand-mark { display: grid; place-items: center; flex: 0 0 42px; height: 42px; border-radius: 12px; background: linear-gradient(135deg, #3f7bff, #1f5eff); color: #fff; font-weight: 800; letter-spacing: -.04em; box-shadow: 0 8px 18px rgba(31,94,255,.32); }
.brand-copy { display: flex; flex-direction: column; white-space: nowrap; }
.brand-copy strong { color: #fff; font-size: 15px; }
.brand-copy span { margin-top: 2px; color: #8290aa; font-size: 10px; }
.side-menu { flex: 1; border: 0; background: transparent; }
.side-menu :deep(.el-menu-item) { height: 46px; margin: 3px 0; border-radius: 10px; color: #aebbd0; }
.side-menu :deep(.el-menu-item:hover) { background: rgba(255,255,255,.07); color: #fff; }
.side-menu :deep(.el-menu-item.is-active) { background: linear-gradient(90deg, rgba(31,94,255,.95), rgba(55,111,245,.78)); color: #fff; box-shadow: 0 7px 16px rgba(20,67,174,.26); }
.menu-icon { display: inline-grid; place-items: center; width: 24px; margin-right: 11px; font-size: 17px; }
.sidebar-foot { display: flex; align-items: center; gap: 9px; padding: 12px 8px 4px; border-top: 1px solid rgba(255,255,255,.08); color: #aab6cb; }
.sidebar-foot div { display: flex; flex-direction: column; }
.sidebar-foot strong { color: #d9e2f3; font-size: 11px; }
.sidebar-foot small { margin-top: 2px; color: #6f7e99; font-size: 9px; }
.online-dot { width: 8px; height: 8px; border-radius: 50%; background: #36d399; box-shadow: 0 0 0 4px rgba(54,211,153,.12); }
.main-area { display: flex; flex: 1; flex-direction: column; min-width: 0; }
.topbar { position: sticky; top: 0; z-index: 15; display: flex; align-items: center; justify-content: space-between; height: 72px; padding: 0 28px; border-bottom: 1px solid rgba(231,235,242,.85); background: rgba(255,255,255,.92); backdrop-filter: blur(12px); }
.topbar-left, .topbar-actions, .user-button, .todo-button { display: flex; align-items: center; }
.topbar-left { gap: 15px; }
.topbar-left strong { display: block; font-size: 16px; }
.topbar-date { display: block; margin-top: 2px; color: var(--text-secondary); font-size: 11px; }
.collapse-btn { display: grid; place-items: center; width: 36px; height: 36px; border: 1px solid var(--border); border-radius: 10px; background: #fff; color: #506078; cursor: pointer; font-size: 20px; }
.topbar-actions { gap: 12px; }
.todo-button, .user-button { position: relative; border: 0; background: transparent; color: #45536a; cursor: pointer; }
.todo-button { gap: 7px; height: 38px; padding: 0 12px; border-radius: 10px; }
.todo-button:hover { background: #f4f7fc; }
.bell { color: var(--brand); font-size: 18px; }
.todo-badge { display: grid; place-items: center; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; background: var(--danger); color: #fff; font-size: 10px; }
.user-button { gap: 9px; padding: 3px 5px 3px 3px; border-radius: 12px; }
.user-button:hover { background: #f4f7fc; }
.user-copy { display: flex; flex-direction: column; align-items: flex-start; }
.user-copy strong { color: var(--text); font-size: 13px; }
.user-copy small { color: var(--text-secondary); font-size: 10px; }
.chevron { color: #91a0b5; }
.page-content { flex: 1; min-width: 0; padding: 24px 28px 40px; }
@media (max-width: 860px) {
  .sidebar { position: fixed; width: 76px; transform: translateX(0); }
  .sidebar.collapsed { width: 76px; }
  .sidebar:not(.collapsed) { width: 238px; }
  .main-area { margin-left: 76px; }
  .topbar { padding: 0 16px; }
  .page-content { padding: 18px 14px 30px; }
}
@media (max-width: 620px) {
  .desktop-only { display: none; }
  .topbar-date { display: none; }
  .topbar { height: 64px; }
}
</style>

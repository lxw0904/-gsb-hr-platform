<template>
  <div class="app-shell">
    <aside class="app-sidebar" :class="{ collapsed: menuCollapsed, mobile: isMobile, 'mobile-open': mobileOpen }">
      <div class="brand" :class="{ compact: menuCollapsed && !isMobile }">
        <div class="brand-mark">澄</div>
        <div v-show="!menuCollapsed || isMobile" class="brand-text">
          <strong>澄明 HR</strong>
          <span>People Operations</span>
        </div>
      </div>
      <el-scrollbar class="menu-scroll">
        <el-menu :default-active="route.path" router :collapse="menuCollapsed && !isMobile" class="side-menu">
          <el-menu-item v-for="item in visibleMenu" :key="item.path" :index="item.path">
            <span class="menu-symbol">{{ item.symbol }}</span>
            <template #title>{{ item.label }}</template>
          </el-menu-item>
        </el-menu>
      </el-scrollbar>
      <div v-show="!menuCollapsed || isMobile" class="sidebar-foot">
        <span class="online-dot"></span>
        <span>本地服务 · SQLite</span>
      </div>
    </aside>
    <div v-if="isMobile && mobileOpen" class="mobile-mask" @click="mobileOpen = false"></div>
    <section class="app-main">
      <header class="topbar">
        <div class="topbar-left">
          <button class="icon-button" type="button" aria-label="折叠菜单" @click="toggleMenu">☰</button>
          <div>
            <h1>{{ route.meta.title }}</h1>
            <p>{{ headerSubtitle }}</p>
          </div>
        </div>
        <div class="topbar-right">
          <el-popover placement="bottom-end" :width="340" trigger="click">
            <template #reference>
              <button class="icon-button notice-button" type="button" aria-label="消息与待办">
                <span>♢</span>
                <i v-if="todoCount" class="notice-badge">{{ todoCount > 99 ? '99+' : todoCount }}</i>
              </button>
            </template>
            <div class="notice-panel">
              <div class="notice-title">
                <strong>消息与待办</strong>
                <span>{{ todoCount }} 项</span>
              </div>
              <template v-if="pendingList.length">
                <button v-for="item in pendingList" :key="item.id" class="todo-item" type="button" @click="goLeaves">
                  <span class="todo-dot"></span>
                  <span>
                    <strong>{{ item.employeeName }} · {{ labelOf(LEAVE_TYPE_LABELS, item.type) }}</strong>
                    <small>{{ item.startDate }} 至 {{ item.endDate }} · {{ item.days }} 天</small>
                  </span>
                </button>
              </template>
              <div v-else class="notice-empty">{{ todoCount ? `你有 ${todoCount} 项待办` : '暂无待办，一切顺利' }}</div>
              <el-button v-if="todoCount" class="notice-action" plain type="primary" @click="goLeaves">查看全部待办</el-button>
            </div>
          </el-popover>
          <el-dropdown trigger="click" @command="handleUserCommand">
            <button class="user-chip" type="button">
              <span class="avatar">{{ avatarText }}</span>
              <span class="user-copy">
                <strong>{{ authStore.state.user?.employeeName || authStore.state.user?.username }}</strong>
                <small>{{ labelOf(ROLE_LABELS, authStore.state.user?.role) }}</small>
              </span>
              <span class="chevron">⌄</span>
            </button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="profile">我的档案</el-dropdown-item>
                <el-dropdown-item divided command="logout">退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </header>
      <main class="page-container">
        <router-view v-slot="{ Component }">
          <transition name="page-fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>
    </section>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { authStore } from '../stores/auth.js';
import { api, ApiError } from '../api/client.js';
import { LEAVE_TYPE_LABELS, ROLE_LABELS, labelOf } from '../utils/format.js';

const route = useRoute();
const router = useRouter();
const menuCollapsed = ref(false);
const mobileOpen = ref(false);
const isMobile = ref(window.innerWidth < 900);
const pendingList = ref([]);
const todoCount = ref(0);

const menu = [
  { path: '/dashboard', label: '工作台', symbol: '⌂' },
  { path: '/employees', label: '员工档案', symbol: '人', roles: ['ADMIN', 'HR'] },
  { path: '/departments', label: '部门组织', symbol: '部', roles: ['ADMIN', 'HR'] },
  { path: '/positions', label: '职位管理', symbol: '职', roles: ['ADMIN', 'HR'] },
  { path: '/profile', label: '我的档案', symbol: '我' },
  { path: '/attendance', label: '考勤管理', symbol: '勤' },
  { path: '/leaves', label: '请假与审批', symbol: '假' },
  { path: '/payrolls', label: '薪酬管理', symbol: '薪' },
  { path: '/users', label: '用户与角色', symbol: '权', roles: ['ADMIN'] },
  { path: '/audit-logs', label: '审计日志', symbol: '审', roles: ['ADMIN'] },
];

const visibleMenu = computed(() => menu.filter((item) => !item.roles || item.roles.includes(authStore.state.user?.role)));
const avatarText = computed(() => (authStore.state.user?.employeeName || authStore.state.user?.username || 'U').slice(0, 1));
const headerSubtitle = computed(() => ({
  dashboard: '关键组织动态与个人事务一屏掌握',
  employees: '维护完整、可信且可追溯的员工档案',
  departments: '以组织结构支撑协作与权限范围',
  positions: '规范职位体系与人员编制归属',
  profile: '查看个人档案并维护联系信息',
  attendance: '按月汇总考勤，异常情况清晰可见',
  leaves: authStore.canManage.value ? '审批团队申请，状态流转全程留痕' : '提交申请并跟踪审批进度',
  payrolls: authStore.canManage.value ? '安全处理月度工资单，敏感字段受权限保护' : '查看本人工资条与发放状态',
  users: '管理账号、角色与系统访问权限',
  'audit-logs': '查询关键操作记录，确保责任可追溯',
}[route.name] || '专业、可信的人力资源管理平台'));

async function loadTodos() {
  try {
    const data = await api.get('/dashboard');
    if (data.scope === 'ORGANIZATION') {
      pendingList.value = data.pendingList || [];
      todoCount.value = data.organization?.pendingApprovals || 0;
    } else {
      pendingList.value = [];
      todoCount.value = data.pendingTodos || 0;
    }
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 401)) todoCount.value = 0;
  }
}

function toggleMenu() {
  if (isMobile.value) mobileOpen.value = !mobileOpen.value;
  else menuCollapsed.value = !menuCollapsed.value;
}

function goLeaves() {
  mobileOpen.value = false;
  router.push('/leaves');
}

async function handleUserCommand(command) {
  if (command === 'profile') return router.push('/profile');
  if (command === 'logout') {
    await authStore.logout();
    ElMessage.success('已安全退出');
    router.replace('/login');
  }
}

function resizeHandler() {
  isMobile.value = window.innerWidth < 900;
  if (!isMobile.value) mobileOpen.value = false;
}

watch(() => route.path, () => { mobileOpen.value = false; });
onMounted(() => {
  window.addEventListener('resize', resizeHandler);
  loadTodos();
});
onBeforeUnmount(() => window.removeEventListener('resize', resizeHandler));
</script>


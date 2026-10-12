import { computed, reactive } from 'vue';
import { api } from '../api/client.js';

const state = reactive({
  token: localStorage.getItem('hr_token') || '',
  user: JSON.parse(localStorage.getItem('hr_user') || 'null'),
  ready: false,
});

function persist() {
  if (state.token) localStorage.setItem('hr_token', state.token);
  else localStorage.removeItem('hr_token');
  if (state.user) localStorage.setItem('hr_user', JSON.stringify(state.user));
  else localStorage.removeItem('hr_user');
}

export const authStore = {
  state,
  isLoggedIn: computed(() => Boolean(state.token)),
  isAdmin: computed(() => state.user?.role === 'ADMIN'),
  isHr: computed(() => state.user?.role === 'HR'),
  canManage: computed(() => ['ADMIN', 'HR'].includes(state.user?.role)),
  async login(username, password) {
    const result = await api.post('/auth/login', { username, password }, { skipAuth: true });
    state.token = result.token;
    state.user = result.user;
    state.ready = true;
    persist();
    return result.user;
  },
  async hydrate() {
    if (!state.token) {
      state.ready = true;
      return;
    }
    try {
      const user = await api.get('/auth/me');
      state.user = user;
      persist();
    } catch {
      this.logout(false);
    } finally {
      state.ready = true;
    }
  },
  async logout(notifyServer = true) {
    if (notifyServer && state.token) {
      try { await api.post('/auth/logout'); } catch { /* 本地退出优先 */ }
    }
    state.token = '';
    state.user = null;
    state.ready = true;
    persist();
  },
  hasRole(roles) {
    if (!roles?.length) return true;
    return roles.includes(state.user?.role);
  },
};

import { defineStore } from 'pinia'
import { api, setToken, getToken } from '../api/http'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: getToken(),
    user: null,
    employee: null,
    initialized: false
  }),
  getters: {
    isAdmin: (state) => state.user?.role === 'admin',
    isHr: (state) => state.user?.role === 'hr',
    isEmployee: (state) => state.user?.role === 'employee',
    canManage: (state) => ['admin', 'hr'].includes(state.user?.role)
  },
  actions: {
    async login(credentials) {
      const data = await api.post('/auth/login', credentials)
      setToken(data.token)
      this.token = data.token
      this.user = data.user
      await this.fetchMe()
      return data
    },
    async fetchMe() {
      if (!this.token) return null
      const data = await api.get('/auth/me', null, { silent: true })
      this.user = data.user
      this.employee = data.employee
      this.initialized = true
      return data
    },
    logout() {
      setToken(null)
      this.token = null
      this.user = null
      this.employee = null
      this.initialized = true
    }
  }
})

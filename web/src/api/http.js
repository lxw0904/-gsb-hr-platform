import { ElMessage } from 'element-plus'

const TOKEN_KEY = 'gsb_hr_token'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

function makeQuery(params) {
  const query = new URLSearchParams()
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') query.set(key, value)
  })
  const text = query.toString()
  return text ? `?${text}` : ''
}

export async function request(path, options = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeout || 15000)
  const headers = { ...(options.headers || {}) }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  let body = options.body
  if (body && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(body)
  }
  try {
    const response = await fetch(`/api${path}${makeQuery(options.query)}`, {
      method: options.method || 'GET',
      headers,
      body,
      signal: controller.signal
    })
    const contentType = response.headers.get('content-type') || ''
    const payload = contentType.includes('application/json') ? await response.json() : await response.text()
    if (!response.ok) {
      if (response.status === 401 && !path.includes('/auth/login')) {
        setToken(null)
        ElMessage.error(payload?.error?.message || '登录状态已失效，请重新登录')
        setTimeout(() => { window.location.href = '/login' }, 500)
      }
      const error = new Error(payload?.error?.message || `请求失败（${response.status}）`)
      error.status = response.status
      error.code = payload?.error?.code
      error.details = payload?.error?.details
      throw error
    }
    return payload?.data ?? payload
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutError = new Error('请求超时，请检查后端服务是否正常运行')
      timeoutError.code = 'TIMEOUT'
      if (!options.silent) ElMessage.error(timeoutError.message)
      throw timeoutError
    }
    if (error instanceof TypeError || error.message === 'Failed to fetch') {
      const networkError = new Error('无法连接后端服务，请确认 server 已在 3000 端口启动')
      networkError.code = 'NETWORK_ERROR'
      if (!options.silent) ElMessage.error(networkError.message)
      throw networkError
    }
    if (error.status && !options.silent) ElMessage.error(error.message)
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

export const api = {
  get: (path, query, options) => request(path, { ...options, method: 'GET', query }),
  post: (path, body, options) => request(path, { ...options, method: 'POST', body }),
  put: (path, body, options) => request(path, { ...options, method: 'PUT', body }),
  delete: (path, body, options) => request(path, { ...options, method: 'DELETE', body }),
  async download(path, query) {
    const response = await fetch(`/api${path}${makeQuery(query)}`, {
      headers: { Authorization: `Bearer ${getToken()}` }
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      throw new Error(payload?.error?.message || '导出失败，请稍后重试')
    }
    const blob = await response.blob()
    const disposition = response.headers.get('content-disposition') || ''
    const match = disposition.match(/filename="?([^";]+)"?/)
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = match?.[1] || 'export.csv'
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }
}

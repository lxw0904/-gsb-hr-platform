import { authStore } from '../stores/auth.js';

export class ApiError extends Error {
  constructor(message, code = 'REQUEST_FAILED', status = 0, details = undefined) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function buildQuery(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') query.set(key, value);
  });
  const text = query.toString();
  return text ? `?${text}` : '';
}

async function parseResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    if (!response.ok) throw new ApiError(`请求失败（HTTP ${response.status}）`, 'HTTP_ERROR', response.status);
    return response;
  }
  const payload = await response.json();
  if (!response.ok || payload.success === false) {
    const error = payload.error || {};
    if (response.status === 401 && !location.pathname.includes('/login')) {
      authStore.logout(false).finally(() => routerReplace('/login'));
    }
    throw new ApiError(error.message || `请求失败（HTTP ${response.status}）`, error.code, response.status, error.details);
  }
  return payload.data;
}

function routerReplace(path) {
  if (location.pathname !== path) location.replace(path);
}

async function request(method, path, body, options = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
  if (authStore.state.token && !options.skipAuth) headers.Authorization = `Bearer ${authStore.state.token}`;
  let response;
  try {
    response = await fetch(`/api${path}${buildQuery(options.params)}`, {
      method,
      headers,
      body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('无法连接后端服务，请确认 server 已启动（默认端口 3000）', 'NETWORK_ERROR', 0);
  }
  return parseResponse(response);
}

async function download(path, params, filename) {
  const headers = { Accept: 'text/csv' };
  if (authStore.state.token) headers.Authorization = `Bearer ${authStore.state.token}`;
  let response;
  try {
    response = await fetch(`/api${path}${buildQuery(params)}`, { headers });
  } catch {
    throw new ApiError('无法连接后端服务，请确认 server 已启动（默认端口 3000）', 'NETWORK_ERROR', 0);
  }
  if (!response.ok) {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const payload = await response.json();
      throw new ApiError(payload.error?.message || '导出失败', payload.error?.code, response.status);
    }
    throw new ApiError(`导出失败（HTTP ${response.status}）`, 'DOWNLOAD_FAILED', response.status);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename || `export-${Date.now()}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export const api = {
  get: (path, params) => request('GET', path, undefined, { params }),
  post: (path, body, options) => request('POST', path, body, options),
  put: (path, body) => request('PUT', path, body),
  delete: (path) => request('DELETE', path),
  download,
};

// Small fetch wrapper. Cookies (session, pending-login, language) are set
// HttpOnly by the server; this file never touches them directly. Mutating
// calls carry the CSRF token the server handed out in /api/session.
const BASE = '/api';

class ApiError extends Error {
  constructor(status, code, extra) {
    super(code);
    this.status = status;
    this.code = code; // stable string, e.g. 'invalid', 'locked', 'too_many'
    this.extra = extra;
  }
}

async function request(path, { method = 'GET', body, csrf } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (csrf) headers['x-csrf-token'] = csrf;
  const res = await fetch(BASE + path, {
    method, headers, credentials: 'same-origin',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty body, e.g. some 204s */ }
  if (!res.ok) throw new ApiError(res.status, data?.error ?? 'server_error', data);
  return data;
}

export const api = {
  session: () => request('/session'),
  setLang: (lang) => request('/lang', { method: 'POST', body: { lang } }),
  login: (mobile) => request('/login', { method: 'POST', body: { mobile } }),
  resend: () => request('/login/resend', { method: 'POST', body: {} }),
  verify: (code) => request('/login/verify', { method: 'POST', body: { code } }),
  consent: (decision, csrf) => request('/consent', { method: 'POST', body: { decision }, csrf }),
  logout: (csrf) => request('/logout', { method: 'POST', body: {}, csrf }),
  reports: () => request('/reports'),
  report: (id) => request(`/reports/${id}`),
  flag: (id, resultId, csrf) => request(`/reports/${id}/flag/${resultId}`, { method: 'POST', body: {}, csrf }),
  link: (token) => request(`/links/${token}`),
  linkSend: (token) => request(`/links/${token}/send`, { method: 'POST', body: {} }),
  linkVerify: (token, code) => request(`/links/${token}/verify`, { method: 'POST', body: { code } }),
};

export { ApiError };
export const reportPdfUrl = (id) => `/api/reports/${id}/pdf`;

// Small fetch wrapper. Cookies (session, pending-login, language) are set
// HttpOnly by the server; this file never touches them directly. Mutating
// calls carry the CSRF token the server handed out in /api/session or
// /api/doctor/session.
const BASE = '/api';

class ApiError extends Error {
  constructor(status, code, extra) {
    super(code);
    this.status = status;
    this.code = code; // stable string, e.g. 'invalid', 'locked', 'too_many'
    this.extra = extra;
  }
}

async function handle(res) {
  let data = null;
  try { data = await res.json(); } catch { /* empty body, e.g. some 204s */ }
  if (!res.ok) throw new ApiError(res.status, data?.error ?? 'server_error', data);
  return data;
}

async function request(path, { method = 'GET', body, csrf } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (csrf) headers['x-csrf-token'] = csrf;
  const res = await fetch(BASE + path, {
    method, headers, credentials: 'same-origin',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return handle(res);
}

/** For file uploads: pass a FormData body as-is (the browser sets the multipart boundary). */
async function requestForm(path, { method = 'POST', form, csrf } = {}) {
  const headers = {};
  if (csrf) headers['x-csrf-token'] = csrf;
  const res = await fetch(BASE + path, { method, headers, credentials: 'same-origin', body: form });
  return handle(res);
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

  // Doctor portal (requires a real pathologist session, cookie "stf")
  doctorSession: () => request('/doctor/session'),
  doctorLogin: (username, password) => request('/doctor/login', { method: 'POST', body: { username, password } }),
  doctorLogout: (csrf) => request('/doctor/logout', { method: 'POST', body: {}, csrf }),
  doctorOrders: () => request('/doctor/orders'),
  doctorOrder: (id) => request(`/doctor/orders/${id}`),
  doctorSignAndSend: (id, data, csrf) => request(`/doctor/orders/${id}/sign-and-send`, { method: 'POST', body: data, csrf }),

  // Document broadcast: upload a PDF, send it as a secure OTP-gated link to a list of numbers
  doctorDocuments: () => request('/doctor/documents'),
  doctorUploadDocument: (form, csrf) => requestForm('/doctor/documents', { form, csrf }),
  doctorDeleteDocument: (id, csrf) => request(`/doctor/documents/${id}`, { method: 'DELETE', body: {}, csrf }),
  doctorBroadcasts: () => request('/doctor/broadcasts'),
  doctorBroadcast: (id) => request(`/doctor/broadcasts/${id}`),
  doctorSendBroadcast: (form, csrf) => requestForm('/doctor/broadcast', { form, csrf }),

  // Patient-facing: opening a broadcast document link
  docLink: (token) => request(`/d/${token}`),
  docLinkSend: (token) => request(`/d/${token}/send`, { method: 'POST', body: {} }),
  docLinkVerify: (token, code) => request(`/d/${token}/verify`, { method: 'POST', body: { code } }),
};

export { ApiError };
export const reportPdfUrl = (id) => `/api/reports/${id}/pdf`;
export const docFileUrl = (token) => `/api/d/${token}/file`;

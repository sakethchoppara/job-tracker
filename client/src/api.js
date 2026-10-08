let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

async function request(path, { method = 'GET', body } = {}) {
  const isForm = body instanceof FormData;
  const res = await fetch(`/api${path}`, {
    method,
    headers: body && !isForm ? { 'Content-Type': 'application/json' } : undefined,
    body: body && !isForm ? JSON.stringify(body) : body,
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (res.status === 401 && !path.startsWith('/auth/')) onUnauthorized();
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

export const STATUSES = [
  { id: 'saved', label: 'Saved', color: '#64748b' },
  { id: 'applied', label: 'Applied', color: '#0ea5e9' },
  { id: 'mail_received', label: 'Mail received', color: '#8b5cf6' },
  { id: 'accepted', label: 'Accepted', color: '#14b8a6' },
  { id: 'interview', label: 'Interview', color: '#f59e0b' },
  { id: 'offer', label: 'Offer', color: '#84cc16' },
  { id: 'hired', label: 'Hired', color: '#10b981' },
  { id: 'rejected', label: 'Rejected', color: '#f43f5e' },
];

export const api = {
  health: () => request('/health'),
  me: () => request('/auth/me'),
  login: (username, password) => request('/auth/login', { method: 'POST', body: { username, password } }),
  register: (username, password) => request('/auth/register', { method: 'POST', body: { username, password } }),
  logout: () => request('/auth/logout', { method: 'POST' }),

  listJobs: () => request('/jobs'),
  createJob: (job) => request('/jobs', { method: 'POST', body: job }),
  updateJob: (id, fields) => request(`/jobs/${id}`, { method: 'PATCH', body: fields }),
  deleteJob: (id) => request(`/jobs/${id}`, { method: 'DELETE' }),
  reorder: (columns) => request('/jobs/order', { method: 'PUT', body: { columns } }),
  analyze: (id) => request(`/jobs/${id}/analyze`, { method: 'POST' }),
  tailor: (id, instructions) => request(`/jobs/${id}/tailor`, { method: 'POST', body: { instructions } }),
  saveTailored: (id, markdown) => request(`/jobs/${id}/resume`, { method: 'PUT', body: { markdown } }),
  jobResumeUrl: (id, format) => `/api/jobs/${id}/resume.${format}`,
  writeCoverLetter: (id, instructions) => request(`/jobs/${id}/cover-letter`, { method: 'POST', body: { instructions } }),
  saveCoverLetter: (id, text) => request(`/jobs/${id}/cover-letter`, { method: 'PUT', body: { text } }),
  coverLetterUrl: (id, format) => `/api/jobs/${id}/cover-letter.${format}`,

  getResume: () => request('/resume'),
  importResume: (formData) => request('/resume/import', { method: 'POST', body: formData }),
  saveResume: (markdown) => request('/resume', { method: 'PUT', body: { markdown } }),
  pageCount: (markdown) => request('/resume/page-count', { method: 'POST', body: { markdown } }),
  baseResumeUrl: (format) => `/api/resume/download.${format}`,
};

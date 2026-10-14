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

// Colours offered when adding a status.
export const STATUS_COLORS = ['#64748b', '#0ea5e9', '#8b5cf6', '#14b8a6', '#f59e0b', '#84cc16', '#10b981', '#f43f5e', '#ec4899', '#6366f1'];

const toStatuses = (rows) => rows.map((s) => ({ id: s.key, label: s.label, color: s.color, count: s.count }));

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
  listStatuses: () => request('/statuses').then(toStatuses),
  addStatus: (label, color, after) => request('/statuses', { method: 'POST', body: { label, color, after } }).then(toStatuses),
  removeStatus: (key) => request(`/statuses/${encodeURIComponent(key)}`, { method: 'DELETE' }).then(toStatuses),
  coachHistory: (id) => request(`/jobs/${id}/chat`),
  coachSend: (id, message) => request(`/jobs/${id}/chat`, { method: 'POST', body: { message } }),
  coachApply: (id, messageId) => request(`/jobs/${id}/chat/${messageId}/apply`, { method: 'POST' }),
  coachClear: (id) => request(`/jobs/${id}/chat`, { method: 'DELETE' }),
  projectRequirements: () => request('/projects/requirements'),
  listProjects: (jobId) => request(`/jobs/${jobId}/projects`),
  startProject: (jobId, keywords, visibility) => request(`/jobs/${jobId}/projects`, { method: 'POST', body: { keywords, visibility } }),
  retryProject: (jobId, id) => request(`/jobs/${jobId}/projects/${id}/retry`, { method: 'POST' }),
  undoProject: (jobId, id) => request(`/jobs/${jobId}/projects/${id}/undo`, { method: 'POST' }),
  deleteProject: (jobId, id) => request(`/jobs/${jobId}/projects/${id}`, { method: 'DELETE' }),
  projectDownloadUrl: (jobId, id) => `/api/jobs/${jobId}/projects/${id}/download`,
  runPanel: (jobId) => request(`/jobs/${jobId}/panel`, { method: 'POST' }),
  applyPanel: (jobId) => request(`/jobs/${jobId}/panel/apply`, { method: 'POST' }),
  undoPanel: (jobId) => request(`/jobs/${jobId}/panel/undo`, { method: 'POST' }),
  interviewHistory: (jobId) => request(`/jobs/${jobId}/interview`),
  interviewTurn: (jobId, answer) => request(`/jobs/${jobId}/interview`, { method: 'POST', body: { answer } }),
  mailStatus: () => request('/mail'),
  connectMail: (email, appPassword) => request('/mail', { method: 'PUT', body: { email, appPassword } }),
  disconnectMail: () => request('/mail', { method: 'DELETE' }),
  checkMail: () => request('/mail/check', { method: 'POST' }),
  undoMailMove: (id) => request(`/mail/events/${id}/undo`, { method: 'POST' }),
  jobEmails: (id) => request(`/mail/jobs/${id}`),
  baseResumeUrl: (format) => `/api/resume/download.${format}`,
};

export const PROJECT_ACTIVE = ['building', 'verifying', 'publishing', 'updating_resume'];

/** Missing keywords the job's resume still doesn't cover (checked in code after tailoring, else the analysis list). */
export function uncoveredKeywords(job) {
  if (!job.analysis) return [];
  const checks = job.tailoring?.keyword_check;
  if (checks?.length) return checks.filter((k) => !k.included).map((k) => k.keyword);
  return job.analysis.missing_keywords.map((k) => k.keyword);
}

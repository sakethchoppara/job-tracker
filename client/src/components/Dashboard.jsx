import { FileText, LogOut, Mail, Plus, Search, Upload } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PROJECT_ACTIVE, api } from '../api.js';
import Board from './Board.jsx';
import JobDetailModal from './JobDetailModal.jsx';
import JobFormModal from './JobFormModal.jsx';
import Logo from './Logo.jsx';
import ThemeToggle from './ThemeToggle.jsx';
import MailModal from './MailModal.jsx';
import ResumeModal from './ResumeModal.jsx';

export default function Dashboard({ user, onLogout }) {
  const [jobs, setJobs] = useState([]);
  const [resume, setResume] = useState(undefined);
  const [llm, setLlm] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showResume, setShowResume] = useState(false);
  const [showMail, setShowMail] = useState(false);
  const [openJobId, setOpenJobId] = useState(null);
  const [statuses, setStatuses] = useState([]);

  const loadJobs = useCallback(() => api.listJobs().then(setJobs).catch((e) => setError(e.message)), []);
  useEffect(() => { api.listStatuses().then(setStatuses).catch((e) => setError(e.message)); }, []);

  useEffect(() => {
    loadJobs();
    api.getResume().then(setResume).catch(() => setResume(null));
    api.health().then((h) => setLlm(h.llm)).catch(() => setError('Can’t reach the server. Check that it’s running on port 5050, then reload.'));
  }, [loadJobs]);

  // Poll while any job is being processed by the LLM.
  const processing = jobs.some((j) => j.ai_status === 'processing' || PROJECT_ACTIVE.includes(j.project?.status) || j.panel?.status === 'running');

  // R23: tell the user when a portfolio project build finishes or fails.
  const lastProjects = useRef(new Map());
  const lastPanels = useRef(new Map());
  useEffect(() => {
    for (const j of jobs) {
      const before = lastProjects.current.get(j.id);
      const now = j.project?.status;
      if (before && PROJECT_ACTIVE.includes(before) && now === 'done') setNotice(`Your portfolio project for ${j.title} at ${j.company} is on GitHub and in the resume.`);
      if (before && PROJECT_ACTIVE.includes(before) && now === 'failed') setNotice(`The portfolio project for ${j.title} at ${j.company} failed. Open its Projects tab to see why.`);
      lastProjects.current.set(j.id, now);
      const panelBefore = lastPanels.current.get(j.id);
      if (panelBefore === 'running' && j.panel?.status === 'done') setNotice(`The hiring panel finished reviewing your resume for ${j.title} at ${j.company}.`);
      if (panelBefore === 'running' && j.panel?.status === 'failed') setNotice(`The hiring panel for ${j.title} at ${j.company} failed. Open its Hiring panel tab to see why.`);
      lastPanels.current.set(j.id, j.panel?.status);
    }
  }, [jobs]);
  useEffect(() => {
    if (!processing) return undefined;
    const t = setInterval(loadJobs, 2500);
    return () => clearInterval(t);
  }, [processing, loadJobs]);

  // Cards can also move on the server (Gmail sync), so refresh the board once a minute.
  useEffect(() => {
    const t = setInterval(loadJobs, 60_000);
    return () => clearInterval(t);
  }, [loadJobs]);

  const upsertJob = (job) => setJobs((prev) => (prev.some((j) => j.id === job.id)
    ? prev.map((j) => (j.id === job.id ? job : j))
    : [job, ...prev]));

  const visibleJobs = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return jobs;
    return jobs.filter((j) => [j.title, j.company, j.location].some((v) => v?.toLowerCase().includes(q)));
  }, [jobs, query]);

  const openJob = jobs.find((j) => j.id === openJobId);

  return (
    <div className="app">
      <header className="topbar glass">
        <div className="brand">
          <Logo />
          <h1>Job Tracker</h1>
          <span className="brand-count">{jobs.length} application{jobs.length === 1 ? '' : 's'}</span>
        </div>
        <label className="search">
          <Search size={16} strokeWidth={1.75} aria-hidden="true" />
          <input
            type="search"
            aria-label="Search applications"
            placeholder="Search title, company, location"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="topbar-actions">
          <button className="btn" onClick={() => setShowResume(true)}>
            {resume ? <FileText size={16} strokeWidth={1.75} /> : <Upload size={16} strokeWidth={1.75} />}
            {resume ? 'My resume' : 'Upload resume'}
          </button>
          <button className="btn primary" onClick={() => setShowNew(true)}>
            <Plus size={16} strokeWidth={2} />New application
          </button>
          <button className="icon-btn" onClick={() => setShowMail(true)} aria-label="Email sync" title="Email sync"><Mail size={17} strokeWidth={1.75} /></button>
          <ThemeToggle />
          <div className="account">
            <span className="avatar" aria-hidden="true">{user.username.slice(0, 1).toUpperCase()}</span>
            <span className="account-name">{user.username}</span>
            <button className="icon-btn" onClick={onLogout} aria-label="Log out" title="Log out"><LogOut size={16} strokeWidth={1.75} /></button>
          </div>
        </div>
      </header>

      {(error || notice || (llm && !llm.provider) || resume === null) && (
        <div className="notices">
          {notice && (
            <div className="notice info" role="status">
              <span>{notice}</span>
              <button className="link" onClick={() => setNotice('')}>Dismiss</button>
            </div>
          )}
          {error && (
            <div className="notice error" role="alert">
              <span>{error}</span>
              <button className="link" onClick={() => setError('')}>Dismiss</button>
            </div>
          )}
          {llm && !llm.provider && (
            <div className="notice warn">AI is off: add ANTHROPIC_API_KEY or GEMINI_API_KEY to server/.env, then restart the server.</div>
          )}
          {resume === null && (
            <div className="notice info">
              <span>Upload your resume to get a recruiter analysis and a tailored version for every job.</span>
              <button className="link" onClick={() => setShowResume(true)}>Upload resume</button>
            </div>
          )}
        </div>
      )}

      <Board
        statuses={statuses}
        setStatuses={setStatuses}
        jobs={visibleJobs}
        allJobs={jobs}
        setJobs={setJobs}
        onOpen={(job) => setOpenJobId(job.id)}
        onError={setError}
        reload={loadJobs}
        onNew={() => setShowNew(true)}
        filtered={!!query.trim()}
      />

      {showNew && (
        <JobFormModal
          statuses={statuses}
          onClose={() => setShowNew(false)}
          onCreated={(job) => { upsertJob(job); setShowNew(false); }}
        />
      )}
      {openJob && (
        <JobDetailModal
          statuses={statuses}
          job={openJob}
          hasResume={!!resume}
          onClose={() => setOpenJobId(null)}
          onChange={upsertJob}
          onDelete={(id) => { setJobs((prev) => prev.filter((j) => j.id !== id)); setOpenJobId(null); }}
        />
      )}
      {showMail && <MailModal statuses={statuses} onClose={() => setShowMail(false)} onJobsChanged={loadJobs} />}
      {showResume && (
        <ResumeModal resume={resume} onClose={() => setShowResume(false)} onSaved={setResume} />
      )}
    </div>
  );
}

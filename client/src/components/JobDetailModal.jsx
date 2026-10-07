import {
  Check, ExternalLink, FileDown, Flag, LoaderCircle, PencilLine, RotateCw, Trash2, X,
} from 'lucide-react';
import { useState } from 'react';
import { STATUSES, api } from '../api.js';
import { AiStatus } from './JobCard.jsx';
import Modal from './Modal.jsx';
import ResumePreview from './ResumePreview.jsx';

const FIELDS = ['title', 'company', 'experience', 'location', 'url', 'description', 'notes'];

function DetailsTab({ job, onChange, onDelete }) {
  const [edits, setEdits] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const value = (k) => edits[k] ?? job[k] ?? '';
  const set = (k) => (e) => setEdits((prev) => ({ ...prev, [k]: e.target.value }));
  const dirty = FIELDS.some((k) => k in edits && edits[k] !== (job[k] ?? ''));
  const aiTag = (k) => job.ai_filled.includes(k) && !(k in edits) && <span className="ai-tag">AI-filled</span>;

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      onChange(await api.updateJob(job.id, edits));
      setEdits({});
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete "${job.title}" at ${job.company}?`)) return;
    await api.deleteJob(job.id);
    onDelete(job.id);
  };

  return (
    <div className="form">
      <div className="row">
        <label>Job title<input value={value('title')} onChange={set('title')} /></label>
        <label>Company<input value={value('company')} onChange={set('company')} /></label>
      </div>
      <div className="row">
        <label><span className="label-row">Experience {aiTag('experience')}</span><input value={value('experience')} onChange={set('experience')} placeholder="Not specified" /></label>
        <label><span className="label-row">Based in {aiTag('location')}</span><input value={value('location')} onChange={set('location')} placeholder="Not specified" /></label>
      </div>
      <label>
        Job link
        <div className="input-with-action">
          <input type="url" value={value('url')} onChange={set('url')} placeholder="https://…" />
          {job.url && <a className="btn" href={job.url} target="_blank" rel="noreferrer"><ExternalLink size={15} strokeWidth={1.75} />Open</a>}
        </div>
      </label>
      <label>Job description<textarea rows={10} value={value('description')} onChange={set('description')} /></label>
      <label>Notes<textarea rows={3} value={value('notes')} onChange={set('notes')} placeholder="Recruiter name, referral, interview dates…" /></label>
      {error && <div className="form-error">{error}</div>}
      <div className="actions-row">
        <button className="btn danger" onClick={remove}><Trash2 size={15} strokeWidth={1.75} />Delete application</button>
        <span className="spacer" />
        {dirty && <button className="btn" onClick={() => setEdits({})}>Discard</button>}
        <button className="btn primary" disabled={!dirty || saving} onClick={save}>{saving ? 'Saving…' : 'Save changes'}</button>
      </div>
      {'description' in edits && <p className="muted small">After saving a new description, run Re-analyze on the Analysis tab.</p>}
    </div>
  );
}

const STAGES = [
  { id: 'analyze', label: 'Recruiter analysis' },
  { id: 'rewrite', label: 'Rewrite experience (XYZ)' },
  { id: 'skim', label: 'ATS & 10-second skim pass' },
];

function useAction(onChange) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (fn) => {
    setBusy(true);
    setError('');
    try {
      onChange(await fn());
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

function Progress({ job }) {
  const current = STAGES.findIndex((s) => s.id === job.ai_stage);
  const steps = job.ai_stage === 'analyze' ? STAGES.slice(0, 1) : STAGES;
  return (
    <div className="placeholder" role="status" aria-live="polite">
      <ol className="stage-list">
        {steps.map((s, i) => (
          <li key={s.id} className={i < current ? 'done' : i === current ? 'active' : ''}>
            <span className="stage-mark" aria-hidden="true">
              {i < current ? <Check size={14} strokeWidth={2.25} /> : i === current ? <LoaderCircle size={14} strokeWidth={2.25} className="spin" /> : null}
            </span>
            {s.label}
          </li>
        ))}
      </ol>
      <p className="muted small">Each step takes 20 to 60 seconds. You can close this and keep working.</p>
    </div>
  );
}

function AnalysisTab({ job, hasResume, onChange, onTailored }) {
  const [instructions, setInstructions] = useState('');
  const { busy, error, run } = useAction(onChange);
  const a = job.analysis;
  const analyzing = job.ai_status === 'processing' && job.ai_stage === 'analyze';

  if (!hasResume) return <div className="placeholder"><p>Upload your resume with the Upload resume button in the top bar to get a recruiter analysis.</p></div>;
  if (analyzing) return <Progress job={job} />;
  if (!a) {
    return (
      <div className="placeholder">
        {job.ai_status === 'error' && <div className="form-error">Analysis failed: {job.ai_error}</div>}
        <p>No analysis yet.</p>
        <button className="btn primary" disabled={busy} onClick={() => run(() => api.analyze(job.id))}>Analyze my resume</button>
        {error && <div className="form-error">{error}</div>}
      </div>
    );
  }

  const tone = a.score >= 75 ? 'good' : a.score >= 50 ? 'ok' : 'low';
  const tailoringBusy = job.ai_status === 'processing';
  return (
    <div className="analysis">
      {job.ai_status === 'error' && <div className="form-error">Last run failed: {job.ai_error}</div>}
      <div className="analysis-head">
        <p className={`score-figure ${tone}`}><strong>{a.score}</strong><span>/100</span></p>
        <div>
          <h3>Recruiter verdict</h3>
          <p>{a.verdict}</p>
        </div>
      </div>
      <div className="analysis-grid">
        <section>
          <h4>Top 5 missing keywords</h4>
          <ul className="flag-list">
            {a.missing_keywords.map((k) => <li key={k.keyword}><strong>{k.keyword}</strong><span className="muted small">{k.why}</span></li>)}
          </ul>
        </section>
        <section>
          <h4>Red flags in a 10-second scan</h4>
          <ul className="flag-list">
            {a.red_flags.map((f) => (
              <li key={f.flag}>
                <strong className="flag"><Flag size={14} strokeWidth={2} aria-hidden="true" />{f.flag}</strong>
                <div className="small">{f.why}</div>
                <div className="small muted">Fix: {f.fix}</div>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <div className="accept-box">
        <textarea rows={2} value={instructions} onChange={(e) => setInstructions(e.target.value)}
          aria-label="Notes for the rewrite (optional)"
          placeholder="Notes for the rewrite (optional), e.g. “my Kafka work was at Example Corp” or “keep it to one page”" />
        <div className="actions-row">
          <button className="btn" disabled={busy || tailoringBusy} onClick={() => run(() => api.analyze(job.id))}><RotateCw size={15} strokeWidth={1.75} />Re-analyze</button>
          <span className="spacer" />
          <span className="muted small accept-hint">Rewrites your experience with these keywords in the XYZ formula, then runs an ATS and skim pass.</span>
          <button className="btn primary" disabled={busy || tailoringBusy}
            onClick={() => {
              if (job.tailored_edited && !window.confirm('This replaces your manual edits to the tailored resume. Continue?')) return;
              run(async () => { const updated = await api.tailor(job.id, instructions); onTailored(); return updated; });
            }}>
            {job.tailored_markdown ? 'Accept and re-tailor' : 'Accept and tailor resume'}
          </button>
        </div>
        {error && <div className="form-error">{error}</div>}
      </div>
    </div>
  );
}

function TailoringNotes({ t }) {
  if (!t) return null;
  const included = t.keyword_check.filter((k) => k.included).length;
  return (
    <aside className="insights">
      <h4>Missing keywords now included <span className="tally">{included}/{t.keyword_check.length}</span></h4>
      <div className="kw-list">
        {t.keyword_check.map((k) => (
          <span key={k.keyword} className={`kw ${k.included ? 'ok' : 'miss'}`}>
            {k.included ? <Check size={12} strokeWidth={2.5} aria-label="included" /> : <X size={12} strokeWidth={2.5} aria-label="not included" />}{k.keyword}
          </span>
        ))}
      </div>
      {t.keywords_not_added?.length > 0 && (
        <>
          <h4>Not added (no evidence in your resume)</h4>
          <ul className="note-list small">{t.keywords_not_added.map((k) => <li key={k.keyword}><strong>{k.keyword}</strong><span>{k.reason}</span></li>)}</ul>
        </>
      )}
      {t.skipped_sections?.length > 0 && (
        <>
          <h4>Would have been skipped</h4>
          <ul className="note-list small">{t.skipped_sections.map((s) => <li key={s.section}><strong>{s.section}</strong><span>{s.reason}</span><span className="muted">Fixed: {s.fix}</span></li>)}</ul>
        </>
      )}
      {(t.rewrite_changes?.length > 0 || t.skim_changes?.length > 0) && (
        <>
          <h4>What changed</h4>
          <ul className="small">{[...(t.rewrite_changes || []), ...(t.skim_changes || [])].map((c) => <li key={c}>{c}</li>)}</ul>
        </>
      )}
    </aside>
  );
}

function ResumeTab({ job, onChange, goToAnalysis }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const { busy, error, run } = useAction(onChange);

  if (job.ai_status === 'processing' && job.ai_stage !== 'analyze') return <Progress job={job} />;
  if (!job.tailored_markdown) {
    return (
      <div className="placeholder">
        <p>No tailored resume yet. Review the analysis, then accept it to tailor your resume.</p>
        <button className="btn primary" onClick={goToAnalysis}>Go to analysis</button>
      </div>
    );
  }

  const placeholders = job.tailoring?.placeholders || [];
  return (
    <div className="resume-tab">
      <div className="toolbar">
        {editing ? (
          <>
            <button className="btn primary" disabled={busy} onClick={() => run(async () => { const j = await api.saveTailored(job.id, draft); setEditing(false); return j; })}>Save edits</button>
            <button className="btn" onClick={() => setEditing(false)}>Cancel</button>
            <span className="muted small">Format: # Name, ## Section, ### Role — Company, _dates_, - bullet, **bold**</span>
          </>
        ) : (
          <>
            <a className="btn primary" href={api.jobResumeUrl(job.id, 'pdf')} download><FileDown size={15} strokeWidth={1.75} />PDF</a>
            <a className="btn" href={api.jobResumeUrl(job.id, 'docx')} download><FileDown size={15} strokeWidth={1.75} />DOCX</a>
            <a className="btn" href={api.jobResumeUrl(job.id, 'md')} download><FileDown size={15} strokeWidth={1.75} />Markdown</a>
            <span className="spacer" />
            {job.tailored_edited && <span className="muted small">Edited by you</span>}
            <button className="btn" onClick={() => { setDraft(job.tailored_markdown); setEditing(true); }}><PencilLine size={15} strokeWidth={1.75} />Edit</button>
            <button className="btn" onClick={goToAnalysis}><RotateCw size={15} strokeWidth={1.75} />Re-tailor</button>
          </>
        )}
      </div>
      {placeholders.length > 0 && (
        <div className="notice warn placeholders">
          <p><strong>Fill {placeholders.length} placeholder{placeholders.length > 1 ? 's' : ''} before sending.</strong> The AI doesn’t invent numbers, so add your real figures with Edit.</p>
          <div className="code-list">{placeholders.map((p) => <code key={p}>{p}</code>)}</div>
        </div>
      )}
      {error && <div className="form-error">{error}</div>}
      <div className="resume-layout">
        {editing
          ? <textarea className="md-editor" aria-label="Tailored resume (Markdown)" value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck />
          : <ResumePreview markdown={job.tailored_markdown} />}
        <TailoringNotes t={job.tailoring} />
      </div>
    </div>
  );
}

export default function JobDetailModal({ job, hasResume, onClose, onChange, onDelete }) {
  const [tab, setTab] = useState(job.tailored_markdown ? 'resume' : 'analysis');
  const statusSelect = (
    <select
      aria-label="Status"
      className="status-select"
      value={job.status}
      onChange={async (e) => onChange(await api.updateJob(job.id, { status: e.target.value }))}
    >
      {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
    </select>
  );

  return (
    <Modal wide title={job.title} subtitle={job.company} onClose={onClose} headerExtra={statusSelect}>
      <div className="detail-head">
        <div className="tabs" role="tablist" aria-label="Application views">
          {[['analysis', 'Analysis'], ['resume', 'Tailored resume'], ['details', 'Details']].map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>
        <span className="spacer" />
        <AiStatus job={job} />
      </div>
      {tab === 'analysis' && <AnalysisTab job={job} hasResume={hasResume} onChange={onChange} onTailored={() => setTab('resume')} />}
      {tab === 'resume' && <ResumeTab job={job} onChange={onChange} goToAnalysis={() => setTab('analysis')} />}
      {tab === 'details' && <DetailsTab job={job} onChange={onChange} onDelete={onDelete} />}
    </Modal>
  );
}

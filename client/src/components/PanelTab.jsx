import { ArrowRight, Check, LoaderCircle, RotateCw, Undo2, Users } from 'lucide-react';
import { useState } from 'react';
import { api } from '../api.js';
import ResumePreview from './ResumePreview.jsx';

const BAD = /^(REJECT|NO|PASS)\b/i; // PASS from a reader means "passes on you"; only the screen's PASS is good
const tone = (r) => (r.reviewer === 'Automated screen' ? (r.verdict.startsWith('PASS') ? 'good' : 'bad')
  : /^(INTERVIEW|HIRE)/i.test(r.verdict) ? 'good' : BAD.test(r.verdict) ? 'bad' : 'mid');

/** The /hiring-panel skill: seven reviewers try to reject the resume, then it is rebuilt with the mistakes fixed. */
export default function PanelTab({ job, hasResume, onChange }) {
  const panel = job.panel;
  const [error, setError] = useState('');
  const act = (fn) => async () => {
    setError('');
    try { onChange(await fn()); } catch (e) { setError(e.message); }
  };
  const running = panel?.status === 'running';
  const r = panel?.status === 'done' ? panel.result : null;
  // The server re-checks on Apply (it also catches base-resume edits); this only greys out the button early.
  const changedSince = r && !panel.applied && (panel.source === 'tailored' ? job.tailored_markdown !== panel.input : !!job.tailored_markdown);

  return (
    <div className="panel-tab">
      <section className="build-panel">
        <h3>Hiring panel</h3>
        <p className="muted small">
          Seven reviewers try to reject {job.tailored_markdown ? 'this job’s tailored resume' : 'your resume'}: an automated screen, the hiring
          manager, and five readers who each judge it alone (the hiring manager, another applicant, the CEO, a recruiter with 30 seconds, and a
          teammate). Then it rebuilds the resume with every mistake fixed, using only your facts. Takes about 2–4 minutes.
        </p>
        <div className="actions-row">
          <button className="btn primary" disabled={running || !hasResume} onClick={act(() => api.runPanel(job.id))}>
            {running ? <LoaderCircle size={15} className="spin" /> : r ? <RotateCw size={15} strokeWidth={1.75} /> : <Users size={15} strokeWidth={1.75} />}
            {running ? 'Panel is reviewing…' : r ? 'Run again' : 'Run the panel'}
          </button>
          <span className="spacer" />
          <span className="small muted">Uses the <a href="https://github.com/alexyc9381/hiring-panel-skill" target="_blank" rel="noreferrer">/hiring-panel</a> skill by Alex Chen (MIT)</span>
        </div>
        {panel?.status === 'failed' && <div className="form-error">The panel failed: {panel.error}</div>}
        {error && <div className="form-error">{error}</div>}
      </section>

      {r && (
        <>
          <section>
            <h3 className="section-title">Automated screen</h3>
            <p className="screen-ba">
              <span className={`verdict ${r.screen_before === 'PASS' ? 'good' : 'bad'}`}>{r.screen_before}</span>
              <ArrowRight size={14} aria-label="after the rebuild" />
              <span className={`verdict ${r.screen_after === 'PASS' ? 'good' : 'bad'}`}>{r.screen_after}</span>
              <span className="muted small">before → after the rebuild</span>
            </p>
          </section>

          <section>
            <h3 className="section-title">The seven</h3>
            <ul className="panel-verdicts">
              {r.reviewers.map((v) => (
                <li key={v.reviewer}>
                  <span className="who">{v.reviewer}</span>
                  <span className={`verdict ${tone(v)}`}>{v.verdict.split(/[\s.:]/)[0]}</span>
                  <span className="small">{v.reason}</span>
                </li>
              ))}
            </ul>
            <p className="small muted">{r.closest_to_rejecting}</p>
          </section>

          <section>
            <h3 className="section-title">What is wrong, worst first</h3>
            <ol className="panel-mistakes">
              {r.mistakes.map((m, i) => (
                <li key={i}>
                  <q>{m.line}</q> {m.why} <span className="muted small">Flagged by {m.flagged_by.join(', ')}.</span>
                </li>
              ))}
            </ol>
          </section>

          <section>
            <div className="actions-row">
              <h3 className="section-title">Rebuilt resume</h3>
              <span className="spacer" />
              {panel.applied
                ? <>
                    <span className="small"><Check size={13} strokeWidth={2.25} /> Now this job’s tailored resume</span>
                    <button className="btn" onClick={act(() => api.undoPanel(job.id))}><Undo2 size={15} strokeWidth={1.75} />Undo</button>
                  </>
                : <button className="btn primary" disabled={changedSince} onClick={act(() => api.applyPanel(job.id))}>Use as tailored resume</button>}
            </div>
            {changedSince && <p className="small muted">The resume changed after the panel read it. Run the panel again to rebuild the current version.</p>}
            {r.questions.length > 0 && (
              <div className="notice placeholders">
                <strong>Only you can answer these.</strong> The rebuilt resume has an [ADD: …] placeholder for each. Fill them in on the Tailored resume tab, or tell the Coach.
                <ul className="small">{r.questions.map((q) => <li key={q}>{q}</li>)}</ul>
              </div>
            )}
            <ResumePreview markdown={panel.improved_md.replace(/^\s*Made with \/hiring-panel by .*$/gm, '')} />
          </section>

          {panel.panel_md && (
            <details className="readme">
              <summary>PANEL.md (the full panel notes)</summary>
              <pre>{panel.panel_md}</pre>
            </details>
          )}
        </>
      )}
    </div>
  );
}

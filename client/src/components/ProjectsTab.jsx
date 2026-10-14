import { Check, CircleAlert, ExternalLink, FileDown, Hammer, LoaderCircle, RotateCw, Trash2, Undo2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { PROJECT_ACTIVE, api, uncoveredKeywords } from '../api.js';

const STAGES = [
  ['building', 'Building'],
  ['verifying', 'Testing'],
  ['publishing', 'Publishing to GitHub'],
  ['updating_resume', 'Updating resume'],
  ['done', 'Done'],
];

function Stepper({ project }) {
  const failedAt = project.status === 'failed' ? project.failed_stage : null;
  const current = STAGES.findIndex(([id]) => id === (failedAt || project.status));
  return (
    <ol className="project-steps">
      {STAGES.map(([id, label], i) => {
        const state = failedAt === id ? 'failed' : i < current || project.status === 'done' ? 'done' : i === current ? 'active' : '';
        return (
          <li key={id} className={state}>
            <span className="stage-mark" aria-hidden="true">
              {state === 'done' && <Check size={12} strokeWidth={2.5} />}
              {state === 'active' && <LoaderCircle size={12} strokeWidth={2.5} className="spin" />}
              {state === 'failed' && <CircleAlert size={12} strokeWidth={2.5} />}
            </span>
            {label}
          </li>
        );
      })}
    </ol>
  );
}

function BuildPanel({ job, problems, hasActive, onStarted }) {
  const all = (job.analysis?.missing_keywords || []).map((k) => k.keyword);
  const uncovered = uncoveredKeywords(job);
  const [picked, setPicked] = useState(() => new Set(uncovered.length ? uncovered : all));
  const [visibility, setVisibility] = useState('private');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!all.length) return <p className="muted">Run the analysis first; projects are built for the skills it finds missing.</p>;

  const toggle = (k) => setPicked((prev) => { const next = new Set(prev); next.has(k) ? next.delete(k) : next.add(k); return next; });
  const build = async () => {
    setBusy(true);
    setError('');
    try {
      onStarted(await api.startProject(job.id, [...picked], visibility));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="build-panel">
      <h3>{uncovered.length ? `${uncovered.length} skill${uncovered.length === 1 ? ' in this job isn’t' : 's in this job aren’t'} on your resume` : 'Build a portfolio project'}</h3>
      <p className="muted small">
        A developer agent builds a small working project that uses these skills, runs its tests, writes a README,
        pushes it to your GitHub as a private repo, and adds it to this job’s tailored resume. Review it, then make it public on GitHub when you’re happy with it. Takes about 5–20 minutes.
      </p>
      <fieldset className="keyword-picks">
        <legend className="sr-only">Skills to cover</legend>
        {all.map((k) => (
          <label key={k} className={`kw pick${picked.has(k) ? ' on' : ''}`}>
            <input type="checkbox" checked={picked.has(k)} onChange={() => toggle(k)} />{k}
          </label>
        ))}
      </fieldset>
      <div className="actions-row">
        <label className="inline-label">GitHub repo
          <select value={visibility} onChange={(e) => setVisibility(e.target.value)}>
            <option value="private">Private</option>
            <option value="public">Public</option>
          </select>
        </label>
        <span className="spacer" />
        <button className="btn primary" disabled={busy || !picked.size || problems?.length > 0 || hasActive} onClick={build}>
          <Hammer size={15} strokeWidth={1.75} />{busy ? 'Starting…' : 'Build project'}
        </button>
      </div>
      {problems?.length > 0 && <div className="notice warn">{problems.join(' ')}</div>}
      {hasActive && <p className="small muted">A project for this job is being built.</p>}
      {error && <div className="form-error">{error}</div>}
    </section>
  );
}

function ProjectCard({ job, project, onChanged, onJobChange }) {
  const d = project.details;
  const [error, setError] = useState('');
  const act = (fn) => async () => {
    setError('');
    try { await fn(); } catch (e) { setError(e.message); }
  };
  const active = PROJECT_ACTIVE.includes(project.status);

  return (
    <article className="project">
      <header className="project-head">
        <div>
          <h3>{d?.title || `Project for ${project.keywords.join(', ')}`}</h3>
          {d?.summary && <p className="muted small">{d.summary}</p>}
        </div>
        {project.repo_url && (
          <a className="btn" href={project.repo_url} target="_blank" rel="noreferrer"><ExternalLink size={15} strokeWidth={1.75} />GitHub</a>
        )}
      </header>
      <Stepper project={project} />

      {project.status === 'failed' && (
        <div className="form-error">
          Failed while {STAGES.find(([id]) => id === project.failed_stage)?.[1].toLowerCase() || 'building'}: {project.error}
        </div>
      )}

      {(active || project.status === 'failed') && project.log.length > 0 && (
        <ol className="project-log" aria-live="polite">
          {project.log.slice(-8).map((l, i) => <li key={i}>{l.line}</li>)}
        </ol>
      )}

      {d && (
        <dl className="project-facts small">
          <dt>Stack</dt><dd>{d.stack.join(', ')}</dd>
          <dt>Covers</dt><dd>{d.keywords_covered.join(', ')}</dd>
          <dt>Tests</dt><dd>{d.verified ? '✓ ' : '✗ '}{d.verification}</dd>
          {project.resume_note && <><dt>Resume</dt><dd>{project.resume_note}</dd></>}
        </dl>
      )}
      {d?.how_to_run && <pre className="run-block">{d.how_to_run}</pre>}
      {d?.talking_points?.length > 0 && (
        <>
          <h4>Be ready to explain</h4>
          <ul className="small talking">{d.talking_points.map((t) => <li key={t}>{t}</li>)}</ul>
        </>
      )}
      {project.readme && (
        <details className="readme">
          <summary>README.md</summary>
          <pre>{project.readme}</pre>
        </details>
      )}

      <div className="actions-row">
        {project.status === 'failed' && (
          <button className="btn primary" onClick={act(async () => onChanged(await api.retryProject(job.id, project.id)))}>
            <RotateCw size={15} strokeWidth={1.75} />Retry
          </button>
        )}
        {project.can_undo && (
          <button className="btn" onClick={act(async () => { const r = await api.undoProject(job.id, project.id); onJobChange(r.job); onChanged(r.project); })}>
            <Undo2 size={15} strokeWidth={1.75} />Remove from resume
          </button>
        )}
        {d && !active && (
          <a className="btn" href={api.projectDownloadUrl(job.id, project.id)} download><FileDown size={15} strokeWidth={1.75} />Download</a>
        )}
        <span className="spacer" />
        {!active && (
          <button className="btn danger" onClick={act(async () => {
            if (!window.confirm('Delete the local copy? The GitHub repository is not touched.')) return;
            await api.deleteProject(job.id, project.id);
            onChanged(null, project.id);
          })}>
            <Trash2 size={15} strokeWidth={1.75} />Delete local copy
          </button>
        )}
      </div>
      {error && <div className="form-error">{error}</div>}
    </article>
  );
}

export default function ProjectsTab({ job, onJobChange }) {
  const [projects, setProjects] = useState(null);
  const [problems, setProblems] = useState(null);
  const load = useCallback(() => api.listProjects(job.id).then(setProjects).catch(() => setProjects([])), [job.id]);

  useEffect(() => { load(); api.projectRequirements().then((r) => setProblems(r.problems)).catch(() => setProblems([])); }, [load]);
  const anyActive = projects?.some((p) => PROJECT_ACTIVE.includes(p.status));
  useEffect(() => {
    if (!anyActive) return undefined;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [anyActive, load]);

  const changed = (project, removedId) => {
    if (removedId) setProjects((prev) => prev.filter((p) => p.id !== removedId));
    else load();
  };

  if (!projects) return <div className="placeholder"><LoaderCircle size={18} className="spin" /></div>;
  return (
    <div className="projects-tab">
      <BuildPanel
        job={job}
        problems={problems}
        hasActive={anyActive}
        onStarted={(started) => {
          // Show the new build on the card and sheet header right away, not on the board's next refresh.
          onJobChange({ ...job, project: { id: started.id, status: started.status, failed_stage: null, repo_url: null } });
          load();
        }}
      />
      {projects.map((p) => <ProjectCard key={p.id} job={job} project={p} onChanged={changed} onJobChange={onJobChange} />)}
    </div>
  );
}

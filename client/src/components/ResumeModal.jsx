import { FileDown, FileText, PencilLine, Upload } from 'lucide-react';
import { useState } from 'react';
import { api } from '../api.js';
import Modal from './Modal.jsx';
import ResumePreview from './ResumePreview.jsx';

export function ImportForm({ onImported, onCancel }) {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    const fd = new FormData();
    fd.append('file', file);
    setBusy(true);
    setError('');
    try {
      onImported(await api.importResume(fd));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="form" onSubmit={submit}>
      <label className="dropzone">
        <input type="file" accept="application/pdf,.pdf" onChange={(e) => setFile(e.target.files[0] || null)} />
        {file ? <FileText size={22} strokeWidth={1.75} aria-hidden="true" /> : <Upload size={22} strokeWidth={1.75} aria-hidden="true" />}
        <strong>{file ? file.name : 'Choose your resume PDF'}</strong>
        <span>{file ? 'Ready to import. Click to choose a different file.' : 'PDF only, up to 10 MB. Scanned resumes work too.'}</span>
      </label>
      {error && <div className="form-error">{error}</div>}
      <div className="actions-row">
        <span className="muted small">{busy ? 'Reading your resume. This can take up to a minute.' : 'The AI reads and structures your PDF without changing what it says.'}</span>
        <span className="spacer" />
        {onCancel && <button type="button" className="btn" onClick={onCancel}>Cancel</button>}
        <button className="btn primary" disabled={busy || !file}>{busy ? 'Importing…' : 'Import resume'}</button>
      </div>
    </form>
  );
}

function ParsedSummary({ structured }) {
  const entries = structured.sections.reduce((n, s) => n + s.entries.length, 0);
  const skills = structured.skills.flatMap((s) => s.items);
  return (
    <div className="parsed">
      <span className="muted small">
        Found {structured.sections.length} sections, {entries} roles, projects and degrees, and {skills.length} skills.
      </span>
      <div className="kw-list">{skills.slice(0, 30).map((s) => <span key={s} className="kw">{s}</span>)}</div>
    </div>
  );
}

export default function ResumeModal({ resume, onClose, onSaved }) {
  const [mode, setMode] = useState(resume ? 'view' : 'import');
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');

  const saveEdit = async () => {
    try {
      onSaved(await api.saveResume(draft));
      setMode('view');
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <Modal wide title="My resume" subtitle="Every analysis and rewrite starts from this version" onClose={onClose}>
      {mode === 'import' && (
        <ImportForm
          onImported={(r) => { onSaved(r); setMode('view'); }}
          onCancel={resume ? () => setMode('view') : null}
        />
      )}
      {mode === 'view' && resume && (
        <div className="resume-tab">
          <div className="toolbar">
            {resume.has_pdf && <a className="btn" href="/api/resume/original.pdf" download><FileDown size={15} strokeWidth={1.75} />Original PDF</a>}
            <a className="btn" href={api.baseResumeUrl('pdf')} download><FileDown size={15} strokeWidth={1.75} />Clean PDF</a>
            <a className="btn" href={api.baseResumeUrl('docx')} download><FileDown size={15} strokeWidth={1.75} />DOCX</a>
            <span className="spacer" />
            <button className="btn" onClick={() => { setDraft(resume.markdown); setMode('edit'); }}><PencilLine size={15} strokeWidth={1.75} />Edit</button>
            <button className="btn primary" onClick={() => setMode('import')}><Upload size={15} strokeWidth={1.75} />Replace PDF</button>
          </div>
          <p className="muted small">
            Uploaded from {resume.filename}, last updated {new Date(resume.updated_at).toLocaleDateString()}. New applications are analyzed against this resume; to refresh an existing one, open it and choose Re-analyze.
          </p>
          <ParsedSummary structured={resume.structured} />
          <ResumePreview markdown={resume.markdown} />
        </div>
      )}
      {mode === 'edit' && (
        <div className="resume-tab">
          <div className="toolbar">
            <button className="btn primary" onClick={saveEdit}>Save</button>
            <button className="btn" onClick={() => setMode('view')}>Cancel</button>
            <span className="muted small">Format: # Name, ## Section, ### Role — Company, _dates_, - bullet, **bold**</span>
          </div>
          {error && <div className="form-error">{error}</div>}
          <div className="resume-layout single">
            <textarea className="md-editor" aria-label="Base resume (Markdown)" value={draft} onChange={(e) => setDraft(e.target.value)} />
            <ResumePreview markdown={draft} />
          </div>
        </div>
      )}
    </Modal>
  );
}

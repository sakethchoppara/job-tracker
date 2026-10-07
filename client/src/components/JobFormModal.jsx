import { useState } from 'react';
import { STATUSES, api } from '../api.js';
import Modal from './Modal.jsx';

const EMPTY = { title: '', company: '', description: '', experience: '', location: '', url: '', status: 'saved' };

export default function JobFormModal({ onClose, onCreated }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      onCreated(await api.createJob(form));
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <Modal
      title="New application"
      subtitle="We’ll analyze your resume against this job as soon as you add it"
      onClose={onClose}
      footer={(
        <>
          <button className="btn" type="button" onClick={onClose}>Cancel</button>
          <button className="btn primary" type="submit" form="job-form" disabled={saving}>{saving ? 'Adding…' : 'Add application'}</button>
        </>
      )}
    >
      <form id="job-form" className="form" onSubmit={submit}>
        <div className="row">
          <label>Job title *<input required value={form.title} onChange={set('title')} placeholder="Senior Frontend Engineer" autoFocus /></label>
          <label>Company *<input required value={form.company} onChange={set('company')} placeholder="Acme Inc." /></label>
        </div>
        <label>
          Job description *
          <textarea required rows={10} value={form.description} onChange={set('description')} placeholder="Paste the full job description here…" />
        </label>
        <div className="row">
          <label><span className="label-row">Experience <span className="muted">(optional)</span></span>
            <input value={form.experience} onChange={set('experience')} placeholder="e.g. 3–5 years" />
          </label>
          <label><span className="label-row">Based in <span className="muted">(optional)</span></span>
            <input value={form.location} onChange={set('location')} placeholder="e.g. Bengaluru (Hybrid)" />
          </label>
        </div>
        <div className="row">
          <label><span className="label-row">Job link <span className="muted">(optional)</span></span><input type="url" value={form.url} onChange={set('url')} placeholder="https://…" /></label>
          <label>Status
            <select value={form.status} onChange={set('status')}>
              {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>
        </div>
        <p className="help">Leave experience or location blank and they’re filled in from the description.</p>
        {error && <div className="form-error">{error}</div>}
      </form>
    </Modal>
  );
}

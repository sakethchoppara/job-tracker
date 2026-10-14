import { ArrowRight, ExternalLink, LoaderCircle, RefreshCw, Undo2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Modal from './Modal.jsx';


function ago(iso) {
  if (!iso) return 'never';
  const min = Math.round((Date.now() - new Date(iso)) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 24 ? `${h} h ago` : new Date(iso).toLocaleDateString();
}

/** One matched email: what it said, which card it moved, and an undo while the move still stands. */
export function EmailEvent({ ev, showJob, onUndo, statuses = [] }) {
  const statusLabel = (id) => statuses.find((s) => s.id === id)?.label || id;
  return (
    <li className="email-event">
      <div className="email-head">
        <strong>{ev.subject || '(no subject)'}</strong>
        <span className="muted small">{ago(ev.received_at)}</span>
      </div>
      <p className="small muted">{ev.sender}{showJob && <> about <span className="ink">{ev.job_title} at {ev.job_company}</span></>}</p>
      {ev.summary && <p className="small">{ev.summary}</p>}
      {ev.moved_to && (
        <p className={`email-move small${ev.undone ? ' undone' : ''}`}>
          {statusLabel(ev.moved_from)} <ArrowRight size={12} strokeWidth={2} aria-label="to" /> {statusLabel(ev.moved_to)}
          {ev.undone ? <span className="muted"> (undone)</span> : onUndo && (
            <button className="link small" onClick={() => onUndo(ev)}><Undo2 size={12} strokeWidth={2} />Undo</button>
          )}
        </p>
      )}
    </li>
  );
}

export default function MailModal({ statuses, onClose, onJobsChanged }) {
  const [data, setData] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { api.mailStatus().then(setData).catch((e) => setError(e.message)); }, []);

  const act = (label, fn) => async (e) => {
    e?.preventDefault();
    setBusy(label);
    setError('');
    try {
      setData(await fn());
      onJobsChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  const undo = (ev) => act('undo', async () => { await api.undoMailMove(ev.id); return api.mailStatus(); })();
  const account = data?.account;

  return (
    <Modal title="Email sync" subtitle="Replies from companies move your cards automatically" onClose={onClose}>
      {!data && !error && <div className="placeholder"><LoaderCircle size={18} className="spin" /></div>}
      {error && <div className="form-error">{error}</div>}

      {data && !account && (
        <form className="form" onSubmit={act('connect', () => api.connectMail(email, password))}>
          <p className="muted">
            Job Tracker checks your Gmail inbox every few minutes. When a company replies about an application
            (received, next steps, interview, offer or rejection), the card moves and the email is attached to it.
            Only emails that look job-related are read by the AI. You can undo any move.
          </p>
          <ol className="steps-list small">
            <li>Turn on 2-Step Verification for your Google account, if it isn’t already.</li>
            <li>
              Create an app password named “Job Tracker”{' '}
              <a className="link" href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">
                at myaccount.google.com/apppasswords <ExternalLink size={12} />
              </a>.
            </li>
            <li>Paste the 16-character password below. Your normal Google password is never used.</li>
          </ol>
          <label>Gmail address<input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          <label>App password
            <input type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="abcd efgh ijkl mnop" required />
          </label>
          <div className="actions-row">
            <span className="spacer" />
            <button className="btn primary" disabled={!!busy}>{busy === 'connect' ? 'Connecting…' : 'Connect Gmail'}</button>
          </div>
        </form>
      )}

      {account && (
        <div className="mail-account">
          <div className="mail-account-head">
            <div>
              <strong>{account.email}</strong>
              <p className="small muted">Checked {ago(account.last_checked)}. New mail is checked every few minutes.</p>
            </div>
            <div className="btn-group">
            <button className="btn" disabled={!!busy} onClick={act('check', api.checkMail)}>
              <RefreshCw size={15} strokeWidth={1.75} className={busy === 'check' ? 'spin' : ''} />{busy === 'check' ? 'Checking…' : 'Check now'}
            </button>
            <button className="btn danger" disabled={!!busy} onClick={act('disconnect', api.disconnectMail)}>Disconnect</button>
            </div>
          </div>
          {account.last_error && <div className="form-error">Last check failed: {account.last_error}</div>}

          <h3 className="section-title">Recent activity</h3>
          {data.events.length
            ? <ul className="email-list">{data.events.map((ev) => <EmailEvent key={ev.id} ev={ev} showJob onUndo={undo} statuses={statuses} />)}</ul>
            : <p className="muted small">No job emails yet. The first sync looks back 14 days, so give it a minute.</p>}
        </div>
      )}
    </Modal>
  );
}

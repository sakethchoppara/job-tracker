import { useState } from 'react';
import { api } from '../api.js';
import Logo from './Logo.jsx';

// Illustrative only: shows the board's shape on the sign-in screen. Labelled as an example in the UI.
const EXAMPLE = [
  { status: 'Applied', color: '#0ea5e9', cards: [{ title: 'Backend Engineer', company: 'Example Co', score: 71, state: 'Review analysis', action: true }] },
  { status: 'Interviewing', color: '#f59e0b', cards: [{ title: 'Platform Engineer', company: 'Sample Labs', score: 84, state: 'Resume ready' }] },
  { status: 'Offer', color: '#10b981', cards: [{ title: 'Data Engineer', company: 'Demo Inc', score: 90, state: 'Resume ready' }] },
];

function ExampleBoard() {
  return (
    <figure className="example-board" aria-label="Example of the board">
      {EXAMPLE.map((lane) => (
        <div key={lane.status} className="lane mini" style={{ '--lane': lane.color }}>
          <div className="lane-head"><span className="lane-dot" /><h2>{lane.status}</h2></div>
          {lane.cards.map((c) => (
            <div key={c.title} className="card">
              <h3>{c.title}</h3>
              <p className="company">{c.company}</p>
              <div className="card-foot">
                <span className="score">{c.score}</span>
                <span className={`ai-state ${c.action ? 'action' : 'quiet'}`}>{c.state}</span>
              </div>
            </div>
          ))}
        </div>
      ))}
      <figcaption>Example board</figcaption>
    </figure>
  );
}

export default function AuthPage({ onAuthed }) {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isRegister = mode === 'register';

  const submit = async (e) => {
    e.preventDefault();
    if (isRegister && password !== confirm) return setError('The passwords don’t match. Type the same password twice.');
    setBusy(true);
    setError('');
    try {
      const profile = await (isRegister ? api.register(username, password) : api.login(username, password));
      onAuthed(profile, { registered: isRegister });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const switchMode = () => {
    setMode(isRegister ? 'login' : 'register');
    setError('');
    setConfirm('');
  };

  return (
    <div className="auth-screen split">
      <section className="auth-intro">
        <div className="brand"><Logo size={32} /><span>Job Tracker</span></div>
        <h1>Every application in one place, with a resume tailored to each.</h1>
        <p className="lede">Paste a job description. Get a recruiter’s read on your resume, then a rewrite you approve. Nothing about you is invented.</p>
        <ExampleBoard />
      </section>

      <form className="auth-card glass form" onSubmit={submit}>
        <h2>{isRegister ? 'Create your account' : 'Log in'}</h2>
        <label>Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus required />
        </label>
        <label>Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            autoComplete={isRegister ? 'new-password' : 'current-password'} minLength={isRegister ? 8 : undefined} required
            aria-describedby={isRegister ? 'pw-help' : undefined} />
          {isRegister && <span id="pw-help" className="help">At least 8 characters.</span>}
        </label>
        {isRegister && (
          <label>Confirm password
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
          </label>
        )}
        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="btn primary block" disabled={busy}>
          {busy ? 'One moment…' : isRegister ? 'Create account' : 'Log in'}
        </button>
        <p className="switch">
          {isRegister ? 'Already have an account?' : 'New to Job Tracker?'}{' '}
          <button type="button" className="link" onClick={switchMode}>{isRegister ? 'Log in' : 'Create an account'}</button>
        </p>
      </form>
    </div>
  );
}

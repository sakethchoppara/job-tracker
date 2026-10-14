import { Check, LoaderCircle, RotateCcw, Send, Sparkles } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api } from '../api.js';

const STARTERS = [
  'Make my summary stronger for this role',
  'Which bullet is weakest, and why?',
  'Help me fill in the placeholders',
];

/** Conversational resume coach. The conversation is stored per job, so the coach remembers it across visits. */
export default function CoachPanel({ job, onChange }) {
  const [messages, setMessages] = useState(null);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(null); // the message being sent, shown until the reply arrives
  const [error, setError] = useState('');
  const [applyError, setApplyError] = useState({});
  const listRef = useRef(null);

  useEffect(() => {
    api.coachHistory(job.id).then(setMessages).catch((e) => { setMessages([]); setError(e.message); });
  }, [job.id]);

  useLayoutEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, pending]);

  const send = async (text) => {
    const message = text.trim();
    if (!message || pending) return;
    setPending(message);
    setDraft('');
    setError('');
    try {
      const added = await api.coachSend(job.id, message);
      setMessages((prev) => [...prev, ...added]);
    } catch (e) {
      setError(e.message);
      setDraft(message); // give the text back so nothing is lost
    } finally {
      setPending(null);
    }
  };

  const apply = async (m) => {
    setApplyError((prev) => ({ ...prev, [m.id]: '' }));
    try {
      const { job: updated, message } = await api.coachApply(job.id, m.id);
      onChange(updated);
      setMessages((prev) => prev.map((x) => (x.id === message.id ? message : x)));
    } catch (e) {
      setApplyError((prev) => ({ ...prev, [m.id]: e.message }));
    }
  };

  const clear = async () => {
    if (!window.confirm('Start a new conversation? The coach will forget this one.')) return;
    await api.coachClear(job.id);
    setMessages([]);
  };

  if (!messages) return <div className="coach-loading"><LoaderCircle size={16} className="spin" /></div>;

  return (
    <div className="coach">
      <div className="coach-list" ref={listRef} aria-live="polite">
        {!messages.length && !pending && (
          <div className="coach-empty">
            <Sparkles size={18} strokeWidth={1.75} aria-hidden="true" />
            <p>Ask for changes in plain words, or tell me things your resume leaves out. I’ll remember what we discuss for this job, and nothing changes until you click Apply.</p>
            <div className="coach-starters">
              {STARTERS.map((s) => <button key={s} className="kw starter" onClick={() => send(s)}>{s}</button>)}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`bubble ${m.role}`}>
            <p>{m.content}</p>
            {m.proposal && (
              <div className="proposal">
                <span className="small">{m.change_summary}</span>
                {m.applied
                  ? <span className="applied small"><Check size={13} strokeWidth={2.25} />Applied</span>
                  : <button className="btn primary sm-btn" onClick={() => apply(m)}>Apply</button>}
                {applyError[m.id] && <p className="small apply-error">{applyError[m.id]}</p>}
              </div>
            )}
          </div>
        ))}
        {pending && (
          <>
            <div className="bubble user"><p>{pending}</p></div>
            <div className="bubble assistant thinking"><LoaderCircle size={14} className="spin" /> Thinking…</div>
          </>
        )}
      </div>
      {error && <div className="form-error small">{error}</div>}
      <form className="coach-input" onSubmit={(e) => { e.preventDefault(); send(draft); }}>
        <textarea
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(draft); } }}
          placeholder="Ask the coach…  (Shift+Enter for a new line)"
          aria-label="Message the resume coach"
          disabled={!!pending}
        />
        <button className="icon-btn send" disabled={!draft.trim() || !!pending} aria-label="Send"><Send size={16} strokeWidth={1.75} /></button>
      </form>
      {messages.length > 0 && (
        <button className="link small coach-clear" onClick={clear}><RotateCcw size={12} strokeWidth={2} />New conversation</button>
      )}
    </div>
  );
}

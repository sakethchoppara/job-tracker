import { LoaderCircle, MessagesSquare, RotateCcw, Send } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api } from '../api.js';

const QUESTIONS = 8;

function Feedback({ f }) {
  return (
    <div className="interview-feedback small">
      <p><span className={`verdict ${f.score >= 7 ? 'good' : f.score >= 5 ? 'mid' : 'bad'}`}>{f.score}/10</span></p>
      <p><strong>What landed:</strong> {f.landed}</p>
      <p><strong>A strong candidate would say:</strong> {f.stronger}</p>
    </div>
  );
}

/** Mock interview: a skeptical hiring manager asks 8 questions one at a time and scores each answer. */
export default function InterviewTab({ job, hasResume }) {
  const [messages, setMessages] = useState(null);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(null); // the answer being sent ('' while starting)
  const [error, setError] = useState('');
  const listRef = useRef(null);

  useEffect(() => { api.interviewHistory(job.id).then(setMessages).catch((e) => { setMessages([]); setError(e.message); }); }, [job.id]);
  useLayoutEffect(() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight; }, [messages, pending]);

  const send = async (answer) => {
    if (pending !== null) return;
    if (answer === '' && messages.length && !window.confirm('Start a new interview? This one will be cleared.')) return;
    setPending(answer);
    setDraft('');
    setError('');
    try {
      setMessages(await api.interviewTurn(job.id, answer));
    } catch (e) {
      setError(e.message);
      setDraft(answer); // give the answer back so nothing is lost
    } finally {
      setPending(null);
    }
  };

  if (!hasResume) return <div className="placeholder"><p>Upload your resume first; the interviewer questions you on it.</p></div>;
  if (!messages) return <div className="placeholder"><LoaderCircle size={18} className="spin" /></div>;

  const asked = messages.filter((m) => m.role === 'interviewer' && !m.final).length;
  const final = messages.at(-1)?.final;
  const scores = messages.filter((m) => m.feedback).map((m) => m.feedback.score);
  const average = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : null;

  if (!messages.length && pending === null) {
    return (
      <div className="placeholder interview-start">
        <MessagesSquare size={22} strokeWidth={1.75} aria-hidden="true" />
        <p>
          A skeptical hiring manager for {job.title} at {job.company} interviews you on {job.tailored_markdown ? 'this job’s tailored resume' : 'your resume'}:
          {' '}{QUESTIONS} hard questions, one at a time. It goes after every number, every claim you can’t obviously back up, and the weakest item
          in your history. After each answer you get a score out of 10, what landed, and what a strong candidate would have said. At the end: hire or no hire.
        </p>
        <button className="btn primary" onClick={() => send('')}>Start the interview</button>
        {error && <div className="form-error">{error}</div>}
      </div>
    );
  }

  return (
    <div className="interview">
      <div className="actions-row">
        <span className="small muted">{final ? 'Interview over' : `Question ${Math.max(asked, 1)} of ${QUESTIONS}`}{average && ` · average ${average}/10`}</span>
        <span className="spacer" />
        <button className="link small coach-clear" disabled={pending !== null} onClick={() => send('')}><RotateCcw size={12} strokeWidth={2} />Start over</button>
      </div>
      <div className="coach-list interview-list" ref={listRef} aria-live="polite">
        {messages.map((m) => (
          <div key={m.id} className={`bubble ${m.role === 'candidate' ? 'user' : 'assistant'}`}>
            {m.feedback && <Feedback f={m.feedback} />}
            {m.final
              ? <div className="interview-final"><span className={`verdict ${m.final.decision === 'HIRE' ? 'good' : 'bad'}`}>{m.final.decision}</span><p>{m.final.reason}</p></div>
              : <p>{m.content}</p>}
          </div>
        ))}
        {pending !== null && (
          <>
            {pending && <div className="bubble user"><p>{pending}</p></div>}
            <div className="bubble assistant thinking"><LoaderCircle size={14} className="spin" /> {pending ? 'Scoring your answer…' : 'Preparing the first question…'}</div>
          </>
        )}
      </div>
      {error && <div className="form-error small">{error}</div>}
      {final ? (
        <button className="btn primary interview-again" onClick={() => send('')}>Practise again</button>
      ) : (
        <form className="coach-input" onSubmit={(e) => { e.preventDefault(); if (draft.trim()) send(draft.trim()); }}>
          <textarea
            rows={3}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (draft.trim()) send(draft.trim()); } }}
            placeholder="Answer as you would out loud…  (Shift+Enter for a new line)"
            aria-label="Your answer"
            disabled={pending !== null}
          />
          <button className="icon-btn send" disabled={!draft.trim() || pending !== null} aria-label="Send answer"><Send size={16} strokeWidth={1.75} /></button>
        </form>
      )}
    </div>
  );
}

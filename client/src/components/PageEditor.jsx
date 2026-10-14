import { Check, LoaderCircle, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { parse } from './ResumePreview.jsx';

// Edit the resume on the page itself. Each line is a contentEditable block that React renders once and then leaves
// alone (its __html never changes), so typing never fights a re-render; the Markdown is rebuilt from the DOM on demand.

const TAG = { name: 'h1', contact: 'p', section: 'h2', entry: 'h3', meta: 'p', bullet: 'div', text: 'p' };
const PREFIX = { name: '# ', section: '## ', entry: '### ', bullet: '- ' };
const PLACEHOLDER = { bullet: 'New bullet', text: 'New line' };

let nextId = 0;
const block = (type, text = '') => ({ id: ++nextId, type, text });

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const toHtml = (text) => escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

// DOM back to our inline syntax: bold elements become **…**, everything else is text.
function domText(node) {
  let out = '';
  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) out += child.nodeValue;
    else if (child.nodeName === 'STRONG' || child.nodeName === 'B') out += `**${domText(child)}**`;
    else if (child.nodeName !== 'BR') out += domText(child);
  }
  return out.replace(/ /g, ' ').replace(/\s*\n\s*/g, ' ');
}

function toMarkdown(blocks) {
  const lines = [];
  for (const { type, text } of blocks) {
    const t = text.trim();
    if (!t) continue;
    if (type === 'section') lines.push('');
    lines.push(type === 'meta' ? `_${t}_` : (PREFIX[type] || '') + t);
  }
  return `${lines.join('\n').trim()}\n`;
}

// Same matching rule as the server's hasKeyword, so the meter agrees with the saved result.
function hasKeyword(text, keyword) {
  let k = keyword.trim();
  // Singular and plural both count ("relational database" for "Relational databases", "APIs" for "API"); lowercase
  // endings only, so "AWS" stays exact.
  const plural = /[a-z0-9]$/i.test(k) ? 's?' : '';
  if (/[a-z]s$/.test(k)) k = k.slice(0, -1);
  const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '[\\s-]+') + plural;
  if (!k) return false;
  const after = /[a-z0-9]$/i.test(keyword.trim()) ? '(?![a-z0-9+#])' : '(?![a-z0-9])';
  // Bold/italic markers must not break a phrase: "**CI/CD** pipelines" contains "CI/CD pipelines".
  return new RegExp(`(?<![a-z0-9])${escaped}${after}`, 'i').test(String(text).replace(/\*/g, ''));
}

function placeCaretAtEnd(el) {
  el.focus();
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

export default function PageEditor({ markdown, keywords = [], saving, onSave, onCancel }) {
  const [blocks, setBlocks] = useState(() => parse(markdown).map((b) => block(b.type, b.text)));
  const [live, setLive] = useState(markdown);
  const [pages, setPages] = useState(null);
  const [counting, setCounting] = useState(false);
  const refs = useRef(new Map());
  const focusId = useRef(null);
  const timer = useRef();

  // Current blocks with the text the user actually sees.
  const read = () => blocks.map((b) => ({ ...b, text: refs.current.get(b.id) ? domText(refs.current.get(b.id)) : b.text }));
  const syncLive = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setLive(toMarkdown(read())), 250);
  };

  useLayoutEffect(() => {
    if (focusId.current == null) return;
    const el = refs.current.get(focusId.current);
    focusId.current = null;
    if (el) placeCaretAtEnd(el);
  });

  // Page count from the server's real PDF renderer, debounced; stale answers are ignored.
  useEffect(() => {
    let cancelled = false;
    setCounting(true);
    const t = setTimeout(() => {
      api.pageCount(live)
        .then(({ pages: n }) => { if (!cancelled) setPages(n); })
        .catch(() => {})
        .finally(() => { if (!cancelled) setCounting(false); });
    }, 600);
    return () => { cancelled = true; clearTimeout(t); };
  }, [live]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const onKeyDown = (e, index) => {
    const current = blocks[index];
    const el = e.currentTarget;
    if (e.key === 'Enter') {
      e.preventDefault();
      const nextType = { bullet: 'bullet', entry: 'bullet', meta: 'bullet', text: 'text', section: 'text' }[current.type];
      if (!nextType) return;
      const fresh = block(nextType);
      focusId.current = fresh.id;
      const synced = read();
      setBlocks([...synced.slice(0, index + 1), fresh, ...synced.slice(index + 1)]);
    } else if (e.key === 'Backspace' && !domText(el).trim() && (current.type === 'bullet' || current.type === 'text') && index > 0) {
      e.preventDefault();
      focusId.current = blocks[index - 1].id;
      setBlocks(read().filter((_, i) => i !== index));
      syncLive();
    }
  };

  const save = () => onSave(toMarkdown(read()));
  const checks = keywords.map((k) => ({ keyword: k, included: hasKeyword(live, k) }));
  const placeholders = (live.match(/\[[^\]\n]+\]/g) || []).length;

  return (
    <div className="resume-tab">
      <div className="toolbar">
        <button className="btn primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save edits'}</button>
        <button className="btn" onClick={onCancel}>Cancel</button>
        <span className="muted small">Click any line to edit it. Enter adds a bullet; Backspace on an empty one removes it.</span>
      </div>
      <div className="resume-layout">
        <div className="resume-paper page-editor">
          {blocks.map((b, i) => {
            const Tag = TAG[b.type];
            return (
              <Tag
                key={b.id}
                ref={(el) => (el ? refs.current.set(b.id, el) : refs.current.delete(b.id))}
                className={`blk ${b.type}`}
                contentEditable="plaintext-only"
                suppressContentEditableWarning
                spellCheck
                data-placeholder={PLACEHOLDER[b.type] || ''}
                aria-label={`${b.type} line`}
                onInput={syncLive}
                onKeyDown={(e) => onKeyDown(e, i)}
                dangerouslySetInnerHTML={{ __html: toHtml(b.text) }}
              />
            );
          })}
        </div>
        <aside className="insights meter" aria-live="polite">
          <h4>Page fit</h4>
          <p className={`fit ${pages > 1 ? 'over' : 'ok'}`}>
            {counting ? <LoaderCircle size={14} strokeWidth={2} className="spin" /> : pages > 1 ? <X size={14} strokeWidth={2.5} /> : <Check size={14} strokeWidth={2.5} />}
            {pages == null ? 'Measuring…' : `${pages} page${pages === 1 ? '' : 's'}`}

          </p>
          {pages > 1 && <p className="small muted">Trim a few lines to fit one page.</p>}
          {checks.length > 0 && (
            <>
              <h4>Missing keywords now included <span className="tally">{checks.filter((c) => c.included).length}/{checks.length}</span></h4>
              <div className="kw-list">
                {checks.map((c) => (
                  <span key={c.keyword} className={`kw ${c.included ? 'ok' : 'miss'}`}>
                    {c.included ? <Check size={12} strokeWidth={2.5} aria-label="included" /> : <X size={12} strokeWidth={2.5} aria-label="not included" />}{c.keyword}
                  </span>
                ))}
              </div>
            </>
          )}
          {placeholders > 0 && <p className="small muted">{placeholders} placeholder{placeholders === 1 ? '' : 's'} left to fill.</p>}
        </aside>
      </div>
    </div>
  );
}

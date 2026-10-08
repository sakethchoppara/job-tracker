// Mirrors server/src/resumeFormat.js parseResume so the preview matches the downloaded PDF.
export function parse(md) {
  const blocks = [];
  let beforeSection = true;
  for (const raw of String(md || '').split(/\r?\n/)) {
    const line = raw.trimEnd();
    let m;
    if (!line.trim()) continue;
    if ((m = line.match(/^#\s+(.*)/))) blocks.push({ type: 'name', text: m[1] });
    else if ((m = line.match(/^##\s+(.*)/))) { blocks.push({ type: 'section', text: m[1] }); beforeSection = false; }
    else if ((m = line.match(/^#{3,}\s+(.*)/))) blocks.push({ type: 'entry', text: m[1] });
    else if ((m = line.match(/^\s*[-*•]\s+(.*)/))) blocks.push({ type: 'bullet', text: m[1] });
    else if ((m = line.trim().match(/^_(.+)_$/))) blocks.push({ type: 'meta', text: m[1] });
    else blocks.push({ type: beforeSection ? 'contact' : 'text', text: line.trim() });
  }
  return blocks;
}

function Inline({ text }) {
  return text
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((part, i) => (part.startsWith('**') && part.endsWith('**')
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : <span key={i}>{part.replace(/\*/g, '')}</span>));
}

export default function ResumePreview({ markdown }) {
  const blocks = parse(markdown);
  const out = [];
  let bullets = [];
  const flush = () => {
    if (bullets.length) out.push(<ul key={`ul${out.length}`}>{bullets}</ul>);
    bullets = [];
  };
  blocks.forEach((b, i) => {
    if (b.type === 'bullet') { bullets.push(<li key={i}><Inline text={b.text} /></li>); return; }
    flush();
    if (b.type === 'name') out.push(<h1 key={i}>{b.text}</h1>);
    else if (b.type === 'contact') out.push(<p key={i} className="contact"><Inline text={b.text} /></p>);
    else if (b.type === 'section') out.push(<h2 key={i}>{b.text}</h2>);
    else if (b.type === 'entry') out.push(<h3 key={i}>{b.text.replace(/\*\*/g, '')}</h3>);
    else if (b.type === 'meta') out.push(<p key={i} className="meta">{b.text}</p>);
    else out.push(<p key={i}><Inline text={b.text} /></p>);
  });
  flush();
  return <div className="resume-paper">{out}</div>;
}

// Parses the resume Markdown dialect (see prompts.js RESUME_FORMAT) and renders it to PDF / DOCX.
import PDFDocument from 'pdfkit';
import {
  AlignmentType, BorderStyle, Document, Packer, Paragraph, TextRun,
} from 'docx';

export function parseResume(md) {
  const blocks = [];
  for (const raw of String(md || '').split(/\r?\n/)) {
    const line = raw.trimEnd();
    let m;
    if (!line.trim()) continue;
    if ((m = line.match(/^#\s+(.*)/))) blocks.push({ type: 'name', text: m[1] });
    else if ((m = line.match(/^##\s+(.*)/))) blocks.push({ type: 'section', text: m[1] });
    else if ((m = line.match(/^#{3,}\s+(.*)/))) blocks.push({ type: 'entry', text: m[1] });
    else if ((m = line.match(/^\s*[-*•]\s+(.*)/))) blocks.push({ type: 'bullet', text: m[1] });
    else if ((m = line.trim().match(/^_(.+)_$/))) blocks.push({ type: 'meta', text: m[1] });
    else blocks.push({ type: 'text', text: line.trim() });
  }
  // Paragraphs between the name and the first section are the contact block.
  let beforeSection = true;
  for (const b of blocks) {
    if (b.type === 'section') beforeSection = false;
    else if (b.type === 'text' && beforeSection) b.type = 'contact';
  }
  return blocks;
}

// Structured view of the Markdown, so code and prompts can use individual fields.
export function toStructured(md) {
  const out = { name: null, contact: [], sections: [], skills: [] };
  let section = null;
  let entry = null;
  for (const b of parseResume(md)) {
    const plain = b.text.replace(/\*\*/g, '').trim();
    if (b.type === 'name') out.name = plain;
    else if (b.type === 'contact') out.contact.push(...plain.split('|').map((s) => s.trim()).filter(Boolean));
    else if (b.type === 'section') {
      section = { title: plain, entries: [], items: [] };
      entry = null;
      out.sections.push(section);
    } else if (!section) continue;
    else if (b.type === 'entry') {
      const [role, organization] = plain.split(/\s+[—–]\s+/);
      entry = { role: role.trim(), organization: organization?.trim() || null, dates: null, location: null, bullets: [] };
      section.entries.push(entry);
    } else if (b.type === 'meta' && entry) {
      const [dates, location] = plain.split('|').map((s) => s.trim());
      Object.assign(entry, { dates: dates || null, location: location || null });
    } else if (b.type === 'bullet' && entry) entry.bullets.push(plain);
    else {
      // "**Languages:** Python, Go" -> { category, items }
      const skill = b.text.match(/^\*\*(.+?)\*\*\s*:?\s*(.+)$/);
      if (skill) {
        out.skills.push({
          category: skill[1].replace(/:$/, '').trim(),
          items: skill[2].split(/[,;]\s*/).map((s) => s.trim()).filter(Boolean),
        });
      } else section.items.push(plain);
    }
  }
  return out;
}

// Split "**bold** rest" into runs; drop markdown link syntax.
export function inlineRuns(text) {
  const clean = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)');
  return clean
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((part) => (part.startsWith('**') && part.endsWith('**')
      ? { text: part.slice(2, -2), bold: true }
      : { text: part.replace(/\*/g, ''), bold: false }));
}

// Standard PDF fonts only cover WinAnsi; map common characters outside it.
const pdfSafe = (s) => s
  .replace(/[→⇒]/g, '->')
  .replace(/[←]/g, '<-')
  .replace(/[≥]/g, '>=')
  .replace(/[≤]/g, '<=')
  .replace(/[−]/g, '-')
  .replace(/[   ]/g, ' ')
  .replace(/[^\x00-\xFF–—‘’“”•…€]/g, '');

export function renderPdf(md) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margins: { top: 42, bottom: 42, left: 50, right: 50 } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = doc.page.margins.left;
    const width = doc.page.width - left - doc.page.margins.right;
    const ink = '#111111';
    const muted = '#555555';

    const writeRuns = (runs, opts) => {
      runs.forEach((r, i) => {
        doc.font(r.bold ? 'Helvetica-Bold' : 'Helvetica');
        const text = pdfSafe(r.text);
        const o = { ...opts, continued: i < runs.length - 1 };
        if (i === 0 && opts.x !== undefined) doc.text(text, opts.x, doc.y, o);
        else doc.text(text, o);
      });
    };

    for (const b of parseResume(md)) {
      switch (b.type) {
        case 'name':
          doc.font('Helvetica-Bold').fontSize(20).fillColor(ink)
            .text(pdfSafe(b.text), left, doc.y, { width, align: 'center' });
          doc.moveDown(0.15);
          break;
        case 'contact':
          doc.fontSize(9.5).fillColor(muted);
          writeRuns(inlineRuns(b.text), { x: left, width, align: 'center' });
          break;
        case 'section':
          doc.moveDown(0.6);
          doc.font('Helvetica-Bold').fontSize(11).fillColor(ink)
            .text(pdfSafe(b.text).toUpperCase(), left, doc.y, { width, characterSpacing: 0.6 });
          doc.moveTo(left, doc.y + 1).lineTo(left + width, doc.y + 1).lineWidth(0.7).strokeColor('#888888').stroke();
          doc.moveDown(0.35);
          break;
        case 'entry':
          doc.moveDown(0.25);
          doc.font('Helvetica-Bold').fontSize(10.5).fillColor(ink)
            .text(pdfSafe(b.text.replace(/\*\*/g, '')), left, doc.y, { width });
          break;
        case 'meta':
          doc.font('Helvetica-Oblique').fontSize(9.5).fillColor(muted)
            .text(pdfSafe(b.text), left, doc.y, { width });
          doc.moveDown(0.1);
          break;
        case 'bullet': {
          doc.fontSize(10).fillColor(ink).font('Helvetica');
          const y = doc.y;
          doc.text('•', left + 6, y, { lineBreak: false });
          doc.y = y;
          writeRuns(inlineRuns(b.text), { x: left + 18, width: width - 18, lineGap: 1 });
          doc.moveDown(0.1);
          break;
        }
        default:
          doc.fontSize(10).fillColor(ink);
          writeRuns(inlineRuns(b.text), { x: left, width, lineGap: 1 });
          doc.moveDown(0.15);
      }
      doc.x = left;
    }
    doc.end();
  });
}

const FONT = 'Calibri';
const toRuns = (text, extra = {}) => inlineRuns(text).map(
  (r) => new TextRun({ text: r.text, bold: r.bold || extra.bold, italics: extra.italics, size: extra.size ?? 21, color: extra.color, font: FONT }),
);

export function renderDocx(md) {
  const children = parseResume(md).map((b) => {
    switch (b.type) {
      case 'name':
        return new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [new TextRun({ text: b.text, bold: true, size: 36, font: FONT })] });
      case 'contact':
        return new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: toRuns(b.text, { size: 19, color: '555555' }) });
      case 'section':
        return new Paragraph({
          spacing: { before: 200, after: 80 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '888888', space: 1 } },
          children: [new TextRun({ text: b.text.toUpperCase(), bold: true, size: 22, font: FONT, characterSpacing: 12 })],
        });
      case 'entry':
        return new Paragraph({ spacing: { before: 100 }, children: [new TextRun({ text: b.text.replace(/\*\*/g, ''), bold: true, size: 21, font: FONT })] });
      case 'meta':
        return new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: b.text, italics: true, size: 19, color: '555555', font: FONT })] });
      case 'bullet':
        return new Paragraph({ bullet: { level: 0 }, spacing: { after: 20 }, children: toRuns(b.text) });
      default:
        return new Paragraph({ spacing: { after: 60 }, children: toRuns(b.text) });
    }
  });
  const doc = new Document({
    sections: [{ properties: { page: { margin: { top: 720, bottom: 720, left: 900, right: 900 } } }, children }],
  });
  return Packer.toBuffer(doc);
}

// Case-insensitive keyword presence with boundaries that tolerate C++, C#, .NET, Node.js etc.
export function hasKeyword(text, keyword) {
  const escaped = keyword.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '[\\s-]+');
  if (!escaped) return false;
  // "C" must not match inside "C++" / "C#".
  const after = /[a-z0-9]$/i.test(keyword.trim()) ? '(?![a-z0-9+#])' : '(?![a-z0-9])';
  return new RegExp(`(?<![a-z0-9])${escaped}${after}`, 'i').test(text);
}

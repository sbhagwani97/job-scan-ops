#!/usr/bin/env node
// Zero-dependency markdown CV -> PDF renderer for job-scan.
//
// Usage: node render-cv-pdf.mjs <input.md> <output.pdf>
//
// Supports the subset of markdown written by /job-scan:apply and setup:
//   # Name                  large centred heading
//   ## Section             bold section heading with a rule
//   ### Role - Company     bold subheading
//   - bullet               bullet list item
//   **bold** inline text    bold runs inside paragraphs/bullets
//   ---                    horizontal rule
// Anything else is treated as a paragraph. Only Latin-1/WinAnsi glyphs can be
// drawn with the built-in Helvetica fonts; other characters are transliterated
// when possible and replaced with "?" otherwise.

import fs from 'node:fs';
import path from 'node:path';

const [, , inFile, outFile] = process.argv;
if (!inFile || !outFile) {
  console.error('usage: node render-cv-pdf.mjs <input.md> <output.pdf>');
  process.exit(1);
}
if (!fs.existsSync(inFile)) {
  console.error(`error: input not found: ${inFile}`);
  process.exit(1);
}

// ---------- text encoding / metrics ----------

const WIN_ANSI = {
  0x2018: '\x91', 0x2019: '\x92', 0x201c: '\x93', 0x201d: '\x94',
  0x2022: '\x95', 0x2013: '\x96', 0x2014: '\x97', 0x2026: '\x85',
  0x20ac: '\x80', 0x2122: '\x99', 0x00a0: ' ',
};

let unsupported = 0;
function toWinAnsi(s) {
  let out = '';
  for (const ch of String(s)) {
    const cp = ch.codePointAt(0);
    if (WIN_ANSI[cp] !== undefined) out += WIN_ANSI[cp];
    else if (cp === 0x09) out += ' ';
    else if (cp >= 0x20 && cp <= 0x7e) out += ch;
    else if (cp >= 0xa0 && cp <= 0xff) out += ch;
    else {
      const base = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (base.length === 1 && base.codePointAt(0) <= 0xff && base.codePointAt(0) >= 0x20) {
        out += base;
      } else {
        out += '?';
        unsupported++;
        process.stderr.write(`warning: character U+${cp.toString(16).toUpperCase()} is not supported by the built-in font; wrote "?"\n`);
      }
    }
  }
  return out;
}

const REG = {
  ' ': 278, '!': 278, '"': 355, '#': 556, $: 556, '%': 889, '&': 667, "'": 191,
  '(': 333, ')': 333, '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278,
  ':': 278, ';': 278, '<': 584, '=': 584, '>': 584, '?': 556, '@': 1015,
  A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278,
  J: 500, K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722,
  S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  '[': 278, '\\': 278, ']': 278, '^': 469, _: 556, '`': 333,
  a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222,
  j: 222, k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333,
  s: 500, t: 278, u: 556, v: 500, w: 722, x: 500, y: 500, z: 500,
  '{': 334, '|': 260, '}': 334, '~': 584,
};

const BOLD = {
  ' ': 278, '!': 333, '"': 474, '#': 556, $: 556, '%': 889, '&': 722, "'": 238,
  '(': 333, ')': 333, '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278,
  ':': 333, ';': 333, '<': 584, '=': 584, '>': 584, '?': 611, '@': 975,
  A: 722, B: 722, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278,
  J: 556, K: 722, L: 611, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722,
  S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  '[': 333, '\\': 278, ']': 333, '^': 584, _: 556, '`': 333,
  a: 556, b: 611, c: 556, d: 611, e: 556, f: 333, g: 611, h: 611, i: 278,
  j: 278, k: 556, l: 278, m: 889, n: 611, o: 611, p: 611, q: 611, r: 389,
  s: 556, t: 333, u: 611, v: 556, w: 778, x: 556, y: 556, z: 500,
  '{': 389, '|': 280, '}': 389, '~': 584,
};

const charWidth = (ch, bold) => (bold ? BOLD : REG)[ch] ?? 556;
function textWidth(str, bold, size) {
  let w = 0;
  for (const ch of str) w += charWidth(ch, bold);
  return (w * size) / 1000;
}

// ---------- markdown parsing ----------

function parseInline(raw) {
  const text = toWinAnsi(raw);
  const runs = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) runs.push({ text: text.slice(last, m.index), bold: false });
    runs.push({ text: m[1], bold: true });
    last = re.lastIndex;
  }
  if (last < text.length) runs.push({ text: text.slice(last), bold: false });
  if (!runs.length) runs.push({ text: '', bold: false });
  return runs.map((r) => ({ ...r, text: r.text.replace(/\*(.+?)\*/g, '$1').replace(/`([^`]+)`/g, '$1') }));
}

function parseMarkdown(md) {
  const blocks = [];
  let para = [];
  const flush = () => {
    if (para.length) {
      blocks.push({ type: 'p', runs: parseInline(para.join(' ')) });
      para = [];
    }
  };
  for (const rawLine of md.replace(/\r\n?/g, '\n').split('\n')) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      flush();
      blocks.push({ type: 'space' });
      continue;
    }
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      flush();
      blocks.push({ type: `h${h[1].length}`, runs: parseInline(h[2]) });
      continue;
    }
    if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) {
      flush();
      blocks.push({ type: 'hr' });
      continue;
    }
    const b = line.match(/^\s*[-*+]\s+(.*)$/);
    if (b) {
      flush();
      blocks.push({ type: 'bullet', runs: parseInline(b[1]) });
      continue;
    }
    para.push(line.trim());
  }
  flush();
  while (blocks.length && blocks[blocks.length - 1].type === 'space') blocks.pop();
  return blocks;
}

// ---------- layout ----------

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 54;
const CONTENT_W = PAGE_W - MARGIN * 2;
const BOTTOM = PAGE_H - MARGIN;
const LINE = 1.36;

const STYLE = {
  h1: { size: 20, before: 0, after: 6, lh: 1.2, bold: true, center: true },
  h2: { size: 12.5, before: 13, after: 5, lh: 1.3, bold: true, rule: true },
  h3: { size: 10.8, before: 8, after: 2, lh: 1.34, bold: true },
  p: { size: 10, before: 0, after: 6, lh: LINE, bold: false },
  bullet: { size: 10, before: 1.5, after: 1.5, lh: LINE, bold: false },
};
const BULLET_INDENT = 14;

class Pdf {
  constructor() {
    this.pages = [];
    this.ops = [];
    this.y = MARGIN;
    this.newPage();
  }

  newPage() {
    if (this.ops.length) {
      this.pages.push(this.ops.join(''));
      this.ops = [];
    }
    this.y = MARGIN;
  }

  ensure(height) {
    if (this.y + height > BOTTOM) this.newPage();
  }

  color(r, g, b) {
    this.ops.push(`${r} ${g} ${b} rg\n`);
  }

  text(x, y, str, size, bold) {
    const font = bold ? '/F2' : '/F1';
    this.ops.push(`BT ${font} ${size} Tf ${x.toFixed(2)} ${(PAGE_H - y).toFixed(2)} Td ${pdfString(str)} Tj ET\n`);
  }

  rule(y, width = CONTENT_W, x = MARGIN) {
    this.ops.push(`0.72 0.72 0.72 RG 0.5 w ${x.toFixed(2)} ${(PAGE_H - y).toFixed(2)} m ${(x + width).toFixed(2)} ${(PAGE_H - y).toFixed(2)} l S\n`);
  }

  dot(x, y, r = 1.35) {
    const k = r * 0.5523;
    const py = PAGE_H - y;
    this.ops.push(
      `${x.toFixed(2)} ${py.toFixed(2)} m ` +
      `${(x + r).toFixed(2)} ${(py + k).toFixed(2)} ${(x + k).toFixed(2)} ${(py + r).toFixed(2)} ${x.toFixed(2)} ${(py + r).toFixed(2)} c ` +
      `${(x - k).toFixed(2)} ${(py + r).toFixed(2)} ${(x - r).toFixed(2)} ${(py + k).toFixed(2)} ${(x - r).toFixed(2)} ${py.toFixed(2)} c ` +
      `${(x - r).toFixed(2)} ${(py - k).toFixed(2)} ${(x - k).toFixed(2)} ${(py - r).toFixed(2)} ${x.toFixed(2)} ${(py - r).toFixed(2)} c ` +
      `${(x + k).toFixed(2)} ${(py - r).toFixed(2)} ${(x + r).toFixed(2)} ${(py - k).toFixed(2)} ${(x + r).toFixed(2)} ${py.toFixed(2)} c f\n`
    );
  }

  drawRuns(runs, x, y, size, indent = 0) {
    let cx = x;
    for (const run of runs) {
      if (!run.text) continue;
      this.text(cx, y, run.text, size, run.bold);
      cx += textWidth(run.text, run.bold, size);
    }
    return cx + indent;
  }
}

function pdfString(s) {
  return '(' + s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)') + ')';
}

// Split inline runs into word/space tokens while keeping bold info.
function tokenize(runs) {
  const tokens = [];
  for (const run of runs) {
    for (const part of run.text.split(/(\s+)/)) {
      if (part) tokens.push({ text: part, bold: run.bold, space: /^\s+$/.test(part) });
    }
  }
  return tokens;
}

function wrapRuns(runs, maxWidth, size) {
  const tokens = tokenize(runs);
  const lines = [];
  let line = [];
  let width = 0;

  const flush = () => {
    const runs = mergeRuns(line);
    while (runs.length && !runs[runs.length - 1].text.trim()) runs.pop();
    if (runs.length) {
      runs[runs.length - 1].text = runs[runs.length - 1].text.replace(/\s+$/, '');
      lines.push(runs);
    }
    line = [];
    width = 0;
  };

  for (const token of tokens) {
    const w = textWidth(token.text, token.bold, size);
    if (!line.length && token.space) continue;
    if (width + w > maxWidth && line.length) {
      flush();
      if (token.space) continue;
    }
    const last = line[line.length - 1];
    if (last && last.bold === token.bold) last.text += token.text;
    else line.push({ ...token });
    width += w;
  }
  flush();
  return lines.length ? lines : [[{ text: '', bold: false }]];
}

function mergeRuns(tokens) {
  const out = [];
  for (const token of tokens) {
    if (!token.text) continue;
    const last = out[out.length - 1];
    if (last && last.bold === token.bold) last.text += token.text;
    else out.push({ text: token.text, bold: token.bold });
  }
  return out;
}

function render(md) {
  const blocks = parseMarkdown(md);
  const pdf = new Pdf();

  for (const block of blocks) {
    if (block.type === 'space') {
      pdf.y += 4;
      continue;
    }
    if (block.type === 'hr') {
      pdf.ensure(14);
      pdf.y += 4;
      pdf.rule(pdf.y);
      pdf.y += 9;
      continue;
    }

    const style = STYLE[block.type];
    const size = style.size;
    const lh = size * style.lh;
    const indent = block.type === 'bullet' ? BULLET_INDENT : 0;
    const maxW = CONTENT_W - indent;
    const lines = wrapRuns(block.runs, maxW, size);

    pdf.ensure(style.before + lines.length * lh + style.after);
    pdf.y += style.before;

    if (style.rule) {
      pdf.color(0.1, 0.1, 0.1);
    } else if (block.type === 'p' || block.type === 'bullet') {
      pdf.color(0.13, 0.13, 0.13);
    } else {
      pdf.color(0.05, 0.05, 0.05);
    }

    for (const line of lines) {
      pdf.ensure(lh + 2);
      const lineW = line.reduce((w, r) => w + textWidth(r.text, r.bold, size), 0);
      let x = MARGIN + indent;
      if (style.center) x = MARGIN + Math.max(0, (CONTENT_W - lineW) / 2);
      if (block.type === 'bullet') {
        pdf.dot(MARGIN + 4, pdf.y + size * 0.42);
      }
      pdf.drawRuns(line, x, pdf.y, size);
      pdf.y += lh;
    }

    pdf.y += style.after;

    if (style.rule) {
      pdf.color(0.78, 0.78, 0.78);
      pdf.rule(pdf.y - 2);
    }
  }

  if (pdf.ops.length) pdf.pages.push(pdf.ops.join(''));
  return pdf.pages;
}

// ---------- PDF assembly ----------

function buildPdf(pages) {
  const objects = [];
  const add = (body) => {
    objects.push(body);
    return objects.length;
  };

  const catalogId = add(null);
  const pagesId = add(null);
  const fontRegId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const fontBoldId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');

  const pageIds = [];
  for (const content of pages) {
    const contentId = add(`<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}endstream`);
    const pageId = add(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_W.toFixed(2)} ${PAGE_H.toFixed(2)}] ` +
      `/Resources << /Font << /F1 ${fontRegId} 0 R /F2 ${fontBoldId} 0 R >> >> ` +
      `/Contents ${contentId} 0 R >>`
    );
    pageIds.push(pageId);
  }

  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

  const header = Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'latin1');
  const chunks = [header];
  const offsets = [0];
  let pos = header.length;

  objects.forEach((body, i) => {
    const buf = Buffer.from(`${i + 1} 0 obj\n${body}\nendobj\n`, 'latin1');
    offsets.push(pos);
    chunks.push(buf);
    pos += buf.length;
  });

  const xrefStart = pos;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  chunks.push(Buffer.from(xref, 'latin1'));

  return Buffer.concat(chunks);
}

const md = fs.readFileSync(inFile, 'utf8').replace(/^\uFEFF/, '');
const pages = render(md);
const pdf = buildPdf(pages);
fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
fs.writeFileSync(outFile, pdf);
console.log(`wrote ${outFile} (${pages.length} page${pages.length === 1 ? '' : 's'})`);
if (unsupported) {
  console.error(`error: ${unsupported} character(s) could not be rendered. The PDF is incomplete; edit the markdown and export the PDF another way.`);
  process.exit(2);
}

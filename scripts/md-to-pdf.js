#!/usr/bin/env node
'use strict';
// Quick, dependency-free (beyond pdfkit, already a project dependency)
// Markdown -> PDF for submission purposes. Not a full CommonMark renderer —
// handles headings, lists, code fences, tables, blockquotes and rules, which
// is everything docs/TDD.md and deployment.md use. Inline bold/code/link
// markup is stripped to plain text rather than styled inline: PDFKit's
// "continued" text mode is easy to get wrong (chained calls only, no
// explicit width/x overrides in between) and a broken PDF is worse than a
// plain one, so this stays deliberately simple and uses only ordinary,
// non-continued doc.text() calls, which auto-advance the cursor correctly.
const fs = require('node:fs');
const PDFDocument = require('pdfkit');

const [, , inPath, outPath, titleArg] = process.argv;
if (!inPath || !outPath) { console.error('usage: md-to-pdf.js <in.md> <out.pdf> [title]'); process.exit(1); }

const text = fs.readFileSync(inPath, 'utf8');
const lines = text.split(/\r?\n/);

const doc = new PDFDocument({ size: 'A4', margin: 54, info: { Title: titleArg || inPath } });
doc.pipe(fs.createWriteStream(outPath));

const PAGE_WIDTH = 495; // usable width inside the margins
const ascii = (s) => String(s ?? '').replace(/[^\x20-\x7E -ɏ‘-”–—…]/g, '?');

/** Strip inline markdown markup to plain readable text. */
function plain(str) {
  return ascii(str)
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)');
}

let inCode = false;
let codeBuf = [];
let tableBuf = [];

function flushCode() {
  if (!codeBuf.length) return;
  doc.font('Courier').fontSize(8.5).fillColor('#333');
  for (const l of codeBuf) doc.text(l.replace(/\t/g, '  ') || ' ', { width: PAGE_WIDTH });
  doc.fillColor('#000').font('Helvetica').fontSize(10.5);
  doc.moveDown(0.4);
  codeBuf = [];
}

function flushTable() {
  if (!tableBuf.length) return;
  const rows = tableBuf.filter((r) => !/^\s*\|?\s*:?-{2,}/.test(r.replace(/\|/g, '')));
  doc.fontSize(9);
  rows.forEach((r, i) => {
    const cells = r.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => plain(c.trim()));
    doc.font(i === 0 ? 'Helvetica-Bold' : 'Helvetica').text(cells.join('   |   '), { width: PAGE_WIDTH });
  });
  doc.fontSize(10.5).font('Helvetica');
  doc.moveDown(0.4);
  tableBuf = [];
}

doc.font('Helvetica').fontSize(10.5);

for (const raw of lines) {
  const line = raw;

  if (/^```/.test(line)) {
    if (!inCode) { flushTable(); inCode = true; codeBuf = []; }
    else { inCode = false; flushCode(); }
    continue;
  }
  if (inCode) { codeBuf.push(line); continue; }

  if (/^\s*\|.*\|\s*$/.test(line)) { tableBuf.push(line); continue; }
  flushTable();

  if (!line.trim()) { doc.moveDown(0.3); continue; }

  if (/^-{3,}\s*$/.test(line.trim())) {
    doc.moveDown(0.2);
    const y = doc.y;
    doc.moveTo(doc.page.margins.left, y).lineTo(doc.page.width - doc.page.margins.right, y).strokeColor('#cccccc').stroke();
    doc.strokeColor('#000000');
    doc.moveDown(0.4);
    continue;
  }

  const h = line.match(/^(#{1,4})\s+(.*)$/);
  if (h) {
    const level = h[1].length;
    doc.moveDown(level === 1 ? 0.5 : 0.4);
    doc.font('Helvetica-Bold').fontSize([0, 16, 13, 11.5, 10.5][level]).fillColor(level <= 2 ? '#0b5c57' : '#000000');
    doc.text(plain(h[2]), { width: PAGE_WIDTH });
    doc.fillColor('#000000').font('Helvetica').fontSize(10.5);
    doc.moveDown(0.2);
    continue;
  }

  const bullet = line.match(/^(\s*)[-*]\s+(.*)$/);
  if (bullet) {
    const depth = Math.floor(bullet[1].length / 2);
    const indent = 14 + depth * 16;
    doc.text(`•  ${plain(bullet[2])}`, { width: PAGE_WIDTH - indent, indent });
    continue;
  }

  const numbered = line.match(/^(\s*)(\d+)\.\s+(.*)$/);
  if (numbered) {
    doc.text(`${numbered[2]}.  ${plain(numbered[3])}`, { width: PAGE_WIDTH - 14, indent: 14 });
    continue;
  }

  const quote = line.match(/^>\s?(.*)$/);
  if (quote) {
    doc.font('Helvetica-Oblique').fillColor('#555555');
    doc.text(plain(quote[1]), { width: PAGE_WIDTH - 14, indent: 14 });
    doc.font('Helvetica').fillColor('#000000');
    continue;
  }

  doc.text(plain(line), { width: PAGE_WIDTH });
}
flushCode();
flushTable();

doc.end();

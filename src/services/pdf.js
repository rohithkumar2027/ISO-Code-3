'use strict';
// Stand-in for the LIS "signed PDF": built from the exported data so the
// download works end to end. In production the LIS-signed PDF dropped next to
// the CSV would be served instead (see docs/TDD.md, assumptions).
const PDFDocument = require('pdfkit');
const { istDateTime } = require('../lib/web');

const ascii = (s) => String(s ?? '').replace(/[^\x20-\x7Eµ°]/g, '?'); // built-in Helvetica = Latin only

function renderReport(res, { cfg, order, patient, results }) {
  const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: `Report ${order.id}`, Author: cfg.labName } });
  doc.pipe(res);

  doc.fontSize(18).font('Helvetica-Bold').text(cfg.labName);
  doc.moveDown(0.2).fontSize(10).font('Helvetica').fillColor('#555').text('Laboratory report');
  doc.moveDown(1).fillColor('#000');

  const info = [
    ['Patient', `${ascii(patient.name)}${patient.age != null ? `, ${patient.age}` : ''}${patient.sex ? ` / ${patient.sex}` : ''}`],
    ['Order', order.id],
    ['Referred by', ascii(order.referring_doctor || '-')],
    ['Collected', order.collected_at ? istDateTime(order.collected_at) : '-'],
    ['Signed', order.signed_at ? istDateTime(order.signed_at) : '-'],
  ];
  doc.fontSize(10);
  for (const [k, v] of info) doc.font('Helvetica-Bold').text(`${k}: `, { continued: true }).font('Helvetica').text(v);

  doc.moveDown(1);
  const cols = [48, 250, 330, 400, 500];
  const head = (y) => {
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#555');
    ['Test', 'Result', 'Unit', 'Reference range', 'Flag'].forEach((h, i) => doc.text(h, cols[i], y));
    doc.moveTo(48, y + 14).lineTo(547, y + 14).strokeColor('#bbb').stroke();
    doc.fillColor('#000');
  };
  let y = doc.y;
  head(y);
  y += 22;
  for (const r of results) {
    if (y > 740) { doc.addPage(); y = 60; head(y); y += 22; }
    const bad = r.flag === 'low' || r.flag === 'high';
    doc.font(bad ? 'Helvetica-Bold' : 'Helvetica').fontSize(10).fillColor(bad ? '#9a2a2a' : '#000');
    doc.text(ascii(r.name), cols[0], y, { width: 195 });
    doc.text(ascii(r.value_raw), cols[1], y, { width: 75 });
    doc.text(ascii(r.unit || ''), cols[2], y, { width: 65 });
    doc.text(ascii(r.ref_raw || '-'), cols[3], y, { width: 95 });
    doc.text(r.flag === 'low' ? 'LOW' : r.flag === 'high' ? 'HIGH' : '', cols[4], y);
    y += 20;
  }
  doc.fillColor('#555').font('Helvetica').fontSize(8)
    .text('Flags are computed from the reference range printed on this report. This copy was generated from the lab export for the patient portal.', 48, Math.max(y + 24, doc.y + 12), { width: 500 });
  doc.end();
}

module.exports = { renderReport };

'use strict';
const { html, raw } = require('../lib/html');
const { t } = require('../i18n');
const { patientPage } = require('./layout');
const { istDate } = require('../lib/web');
const summaries = require('../services/summaries');

const csrfField = (csrf) => html`<input type="hidden" name="_csrf" value="${csrf}">`;
const banner = (kind, text) => (text ? html`<div class="banner ${kind}" role="${kind === 'bad' ? 'alert' : 'status'}"><p>${text}</p></div>` : '');
const num = (n) => (n === null || n === undefined ? '' : String(Number(n.toFixed ? n.toFixed(2) : n)));

function loginPage({ lang, error, mobile = '' }) {
  return patientPage({
    lang, path: '/login', title: t(lang, 'login_title'),
    body: html`<h1 class="page-title">${t(lang, 'login_title')}</h1>
      <p class="lede">${t(lang, 'login_sub')}</p>
      ${banner('bad', error)}
      <form method="post" action="/login" autocomplete="on">
        <label for="mobile">${t(lang, 'mobile_label')}</label>
        <input id="mobile" name="mobile" type="tel" inputmode="numeric" autocomplete="tel-national" maxlength="16" required value="${mobile}" placeholder="98765 43210">
        <div class="actions"><button class="btn" type="submit">${t(lang, 'send_code')}</button></div>
      </form>`,
  });
}

function verifyPage({ lang, action, path, maskedMobile, error, demoCode, resendAction, csrf = null, notice }) {
  return patientPage({
    lang, path, title: t(lang, 'verify_title'),
    body: html`<h1 class="page-title">${t(lang, 'verify_title')}</h1>
      <p class="lede">${t(lang, 'verify_sub', { m: maskedMobile })}</p>
      ${banner('bad', error)}${banner('info', notice)}
      <form method="post" action="${action}">
        <label for="code">${t(lang, 'code_label')}</label>
        <input id="code" class="code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="8" pattern="[0-9 ]*" required autofocus>
        <div class="actions"><button class="btn" type="submit">${t(lang, 'continue')}</button></div>
      </form>
      <form method="post" action="${resendAction}" class="actions">
        <button class="btn quiet" type="submit">${t(lang, 'resend')}</button>
      </form>
      ${demoCode ? html`<p class="demo">${t(lang, 'demo_code', { c: demoCode })}</p>` : ''}`,
  });
}

function consentPage({ lang, csrf, next }) {
  return patientPage({
    lang, path: '/consent', title: t(lang, 'consent_title'), csrf, loggedIn: false,
    body: html`<h1 class="page-title">${t(lang, 'consent_title')}</h1>
      <div class="card consent"><ul>
        <li>${t(lang, 'consent_1')}</li><li>${t(lang, 'consent_2')}</li>
        <li>${t(lang, 'consent_3')}</li><li>${t(lang, 'consent_4')}</li></ul></div>
      <form method="post" action="/consent" class="actions">
        ${csrfField(csrf)}<input type="hidden" name="next" value="${next ?? ''}">
        <button class="btn" type="submit" name="decision" value="agree">${t(lang, 'consent_agree')}</button>
        <button class="btn quiet" type="submit" name="decision" value="decline">${t(lang, 'consent_decline')}</button>
      </form>`,
  });
}

function statusPill(lang, status) {
  if (status === 'processing') return html`<span class="pill processing">… ${t(lang, 'status_processing')}</span>`;
  return html`<span class="pill ready">✓ ${t(lang, 'status_ready')}</span>`;
}

function reportsPage({ lang, csrf, people, notice }) {
  const empty = people.every((p) => !p.orders.length);
  return patientPage({
    lang, path: '/reports', title: t(lang, 'reports_title'), csrf, loggedIn: true,
    body: html`<h1 class="page-title">${t(lang, 'reports_title')}</h1>
      ${banner('info', notice)}
      ${empty ? html`<div class="card empty"><p>${t(lang, 'reports_empty')}</p></div>` : people.map((p) => html`
        ${people.length > 1 ? html`<h2 class="person">${p.name}</h2>` : html`<div class="lede">${p.name}</div>`}
        ${p.orders.map((o) => html`<article class="card order">
          <div class="row"><span class="id">${o.id}</span>${statusPill(lang, o.status)}</div>
          <div class="meta">${o.status === 'processing' ? '' : t(lang, 'signed_on', { d: istDate(o.signed_at) })}${o.referring_doctor ? html` · ${o.referring_doctor}` : ''}</div>
          ${o.status === 'ready_critical' ? html`<p class="small"><strong>! ${t(lang, 'critical_note')}</strong></p>` : ''}
          ${o.status === 'processing' ? '' : html`<a class="btn" href="/reports/${o.id}">${t(lang, 'view_report')}</a>`}
        </article>`)}`)}`,
  });
}

function notReadyPage({ lang, csrf, order }) {
  return patientPage({
    lang, path: `/reports/${order.id}`, title: t(lang, 'not_ready_title'), csrf, loggedIn: true,
    body: html`<h1 class="page-title">${t(lang, 'not_ready_title')}</h1>
      <p class="lede">${t(lang, 'not_ready_body')}</p>
      <div class="actions"><a class="btn secondary" href="/reports">${t(lang, 'back')}</a></div>`,
  });
}

/** Tiny inline SVG showing where the value sits against its range. Decorative: the numbers are in text. */
function rangeBar(r, label) {
  const v = r.value_num;
  const lo = r.ref_low;
  const hi = r.ref_high;
  if (v === null || (lo === null && hi === null)) return '';
  let min = Math.min(v, lo ?? v, hi ?? v);
  let max = Math.max(v, lo ?? v, hi ?? v);
  const span = max - min || 1;
  min -= span * 0.2; max += span * 0.2;
  const W = 300;
  const x = (n) => Math.round(((n - min) / (max - min)) * W * 10) / 10;
  const x1 = lo === null ? 0 : x(lo);
  const x2 = hi === null ? W : x(hi);
  return html`<svg class="bar" viewBox="0 0 ${W} 22" role="img" aria-label="${label}" preserveAspectRatio="none">
    <rect class="track" x="0" y="8" width="${W}" height="6" rx="3"/>
    <rect class="band" x="${x1}" y="8" width="${Math.max(x2 - x1, 2)}" height="6"/>
    <circle class="dot" cx="${Math.min(Math.max(x(v), 8), W - 8)}" cy="11" r="8"/></svg>`;
}

function rangeText(r) {
  if (r.ref_low !== null && r.ref_high !== null) return `${num(r.ref_low)} – ${num(r.ref_high)}`;
  if (r.ref_high !== null) return `< ${num(r.ref_high)}`;
  if (r.ref_low !== null) return `> ${num(r.ref_low)}`;
  return r.ref_raw || '';
}

const flagText = (lang, f) => (f === 'low' ? `▼ ${t(lang, 'low')}` : f === 'high' ? `▲ ${t(lang, 'high')}` : '');

function finding({ lang, csrf, order, r, s }) {
  const dirWord = flagText(lang, r.flag);
  const local = summaries.localName(r.name, lang);
  let explanation = '';
  if (s) {
    if (s.status === 'flagged') {
      explanation = html`<p class="explain muted">${t(lang, 'under_review')}</p>`;
    } else {
      explanation = html`<p class="explain" lang="${lang}">${s.text}</p>
        <p class="small">
          ${s.source === 'ai' && s.status !== 'approved' ? html`<span class="tag ai">${t(lang, 'ai_tag')}</span>` : ''}
          ${s.status === 'approved' ? html`<span class="tag checked">✓ ${t(lang, 'checked_tag')}</span>` : ''}
        </p>
        <form method="post" action="/reports/${order.id}/flag/${r.id}" class="inline-form">
          ${csrfField(csrf)}<button class="btn quiet small" type="submit">${t(lang, 'flag_wrong')}</button></form>`;
    }
  }
  return html`<section class="finding">
    <div class="head"><span class="test">${r.name}</span><span class="flag ${r.flag}">${dirWord}</span></div>
    ${local && local !== r.name ? html`<div class="local" lang="${lang}">${local}</div>` : ''}
    <div class="value">${r.value_raw}${r.unit ? html`<span class="unit">${r.unit}</span>` : ''}</div>
    <div class="range">${t(lang, 'usual_range')}: ${rangeText(r)}${r.unit ? ` ${r.unit}` : ''}</div>
    ${rangeBar(r, `${r.name} ${r.value_raw}, ${dirWord}`)}
    ${explanation}
  </section>`;
}

function reportPage({ lang, csrf, order, patient, results, sums, notice }) {
  const odd = results.filter((r) => r.flag === 'low' || r.flag === 'high');
  const critical = order.status === 'ready_critical';
  return patientPage({
    lang, path: `/reports/${order.id}`, title: `${order.id}`, csrf, loggedIn: true,
    body: html`
      <div class="who">
        <div class="muted small">${t(lang, 'patient')}</div>
        <div class="name">${patient.name}</div>
        <div class="muted small">${order.id} · ${t(lang, 'signed_on', { d: istDate(order.signed_at) })}${order.referring_doctor ? html` · ${t(lang, 'doctor')}: ${order.referring_doctor}` : ''}</div>
      </div>
      ${banner('ok', notice)}
      ${critical ? html`<div class="banner bad" role="alert"><h2>! ${t(lang, 'critical_title')}</h2><p>${t(lang, 'critical_body')}</p></div>` : ''}
      <h1 class="page-title">${t(lang, 'standout')}</h1>
      ${odd.length ? odd.map((r) => finding({ lang, csrf, order, r, s: critical ? null : sums.get(r.id) }))
        : html`<div class="banner ok"><p>✓ ${t(lang, 'all_normal')}</p></div>`}
      <div class="actions"><a class="btn" href="/reports/${order.id}/pdf">${t(lang, 'download_pdf')}</a>
        <a class="btn secondary" href="/reports">${t(lang, 'back')}</a></div>
      <details>
        <summary>${t(lang, 'all_results')} (${results.length})</summary>
        <table>
          <thead><tr><th>${t(lang, 'result')}</th><th></th><th>${t(lang, 'usual_range')}</th></tr></thead>
          <tbody>${results.map((r) => html`<tr>
            <td>${r.name}</td>
            <td class="num"><strong>${r.value_raw}</strong> ${r.unit ?? ''} ${r.flag === 'unknown' ? '' : html`<span class="flag ${r.flag}">${flagText(lang, r.flag)}</span>`}</td>
            <td class="num muted">${r.flag === 'unknown' && r.value_num === null ? t(lang, 'see_report') : rangeText(r)}</td></tr>`)}</tbody>
        </table>
      </details>
      <p class="footnote" lang="${lang}">${summaries.FOOTER[lang]} ${t(lang, 'read_full')}</p>`,
  });
}

function linkLandingPage({ lang, token, maskedMobile, error }) {
  return patientPage({
    lang, path: `/r/${token}`, title: t(lang, 'link_title'),
    body: html`<h1 class="page-title">${t(lang, 'link_title')}</h1>
      <p class="lede">${t(lang, 'link_body', { m: maskedMobile })}</p>
      ${banner('bad', error)}
      <form method="post" action="/r/${token}/send" class="actions">
        <button class="btn" type="submit">${t(lang, 'link_send')}</button></form>`,
  });
}

module.exports = { loginPage, verifyPage, consentPage, reportsPage, notReadyPage, reportPage, linkLandingPage, rangeText, rangeBar };

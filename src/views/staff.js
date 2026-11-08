'use strict';
const { html, raw } = require('../lib/html');
const { istDateTime, istDate } = require('../lib/web');
const { ASSET_V } = require('./layout');

const NAV = [
  ['/staff', 'Patients', ['frontdesk']],
  ['/staff/import', 'LIS import', ['frontdesk']],
  ['/staff/tasks', 'Callbacks', ['frontdesk']],
  ['/staff/log', 'Access log', ['frontdesk', 'ops']],
  ['/staff/report', 'Delivery report', ['ops']],
  ['/staff/review', 'Summary review', ['pathologist']],
];

const csrf = (token) => html`<input type="hidden" name="_csrf" value="${token}">`;

function staffPage({ title, user, here, body, token = null }) {
  return html`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer">
<title>${title} · Staff</title><link rel="stylesheet" href="/app.css?v=${ASSET_V}"></head>
<body class="staff">
<header class="s-head"><div class="in">
  <a class="brand" href="/staff">Report portal · Staff</a>
  ${user ? html`<nav class="s-nav" aria-label="Staff">${NAV.filter(([, , roles]) => roles.includes(user.role)).map(([href, label]) =>
    html`<a href="${href}" ${href === here ? raw('aria-current="page"') : ''}>${label}</a>`)}</nav>
  <form method="post" action="/staff/logout" class="inline-form">${csrf(token)}
    <span class="muted small">${user.name} · ${user.role}</span>
    <button class="btn quiet small" type="submit">Log out</button></form>` : ''}
</div></header>
<main class="s-main">${body}</main>
</body></html>`;
}

const pill = (kind, text, glyph = '') => html`<span class="pill ${kind}">${glyph} ${text}</span>`;

function deliveryPill(d) {
  if (d.state === 'none') return pill('processing', 'Not sent');
  if (d.state === 'delivered') return pill('delivered', `Delivered by ${d.channel === 'sms' ? 'SMS' : 'WhatsApp'}`, '✓');
  if (d.state === 'sent') return pill('sent', `Sent by ${d.channel === 'sms' ? 'SMS' : 'WhatsApp'}`, '→');
  return pill('failed', 'Failed', '!');
}

function orderStatusPill(status) {
  if (status === 'processing') return pill('processing', 'Processing', '…');
  if (status === 'ready_critical') return pill('attention', 'Ready · critical', '!');
  return pill('ready', 'Ready', '✓');
}

function loginPage({ error }) {
  return staffPage({
    title: 'Staff sign-in', user: null, here: '',
    body: html`<div class="panel pad narrow">
      <h1>Staff sign-in</h1>
      ${error ? html`<div class="banner bad" role="alert"><p>${error}</p></div>` : ''}
      <form method="post" action="/staff/login" class="stack">
        <div><label for="u">Username</label><input id="u" name="username" type="text" autocomplete="username" required autofocus></div>
        <div><label for="p">Password</label><input id="p" name="password" type="password" autocomplete="current-password" required></div>
        <button class="btn" type="submit">Sign in</button>
      </form></div>`,
  });
}

function searchPage({ user, token, q, hits, attention, stats, tooShort }) {
  return staffPage({
    title: 'Patients', user, here: '/staff', token,
    body: html`<h1>Find a patient</h1>
      <form method="get" action="/staff" class="searchbar" role="search">
        <input type="search" name="q" value="${q}" placeholder="Name, mobile number or order ID (ORD-71204)" aria-label="Search" autofocus>
        <button class="btn" type="submit">Search</button></form>
      ${tooShort ? html`<div class="banner warn mt"><p>Type at least 3 characters.</p></div>` : ''}
      ${q && !tooShort ? html`<div class="panel mt">${hits.length ? html`<table>
        <thead><tr><th>Patient</th><th>Mobile</th><th>Orders</th><th></th></tr></thead>
        <tbody>${hits.map((h) => html`<tr><td>${h.name}</td><td class="num">${h.mobile}</td><td>${h.orders}</td>
          <td><a href="/staff/patients/${h.id}">Open</a></td></tr>`)}</tbody></table>`
        : html`<div class="empty"><strong>No match</strong>Check the spelling, or try the last 4 digits of the mobile number.</div>`}</div>` : ''}
      ${!q ? html`
        <div class="grid">
          <div class="stat"><div class="n">${stats.signedToday}</div><div class="l">Reports signed today</div></div>
          <div class="stat"><div class="n">${stats.failed}</div><div class="l">Delivery failed, needs action</div></div>
          <div class="stat"><div class="n">${stats.callbacks}</div><div class="l">Open critical callbacks</div></div>
        </div>
        <h2>Needs your attention</h2>
        <div class="panel">${attention.length ? html`<table><thead><tr><th>Order</th><th>Patient</th><th>Problem</th><th></th></tr></thead>
          <tbody>${attention.map((a) => html`<tr><td>${a.order_id}</td><td>${a.name}</td><td>${a.problem}</td>
            <td><a href="/staff/patients/${a.patient_id}">Open</a></td></tr>`)}</tbody></table>`
          : html`<div class="empty"><strong>All clear</strong>No failed deliveries right now.</div>`}</div>` : ''}`,
  });
}

function patientPage({ user, token, patient, family, orders, flash }) {
  const banners = {
    ok: ['ok', 'A new link was sent. The old link no longer works.'],
    fail: ['bad', 'The message could not be delivered on WhatsApp or SMS. Check the number with the patient.'],
    unsigned: ['warn', 'That report is not signed yet, so nothing was sent.'],
  };
  const b = banners[flash];
  return staffPage({
    title: patient.name, user, here: '/staff', token,
    body: html`<p class="small"><a href="/staff">← Search</a></p>
      <h1>${patient.name}</h1>
      <p class="muted">${patient.mobile}${patient.age != null ? ` · ${patient.age}` : ''}${patient.sex ? ` ${patient.sex}` : ''}
        ${family.length ? html` · Same number also covers: ${family.map((f, i) => html`${i ? ', ' : ''}<a href="/staff/patients/${f.id}">${f.name}</a>`)}` : ''}</p>
      ${b ? html`<div class="banner ${b[0]}" role="status"><p>${b[1]}</p></div>` : ''}
      <div class="panel">${orders.length ? html`<table>
        <thead><tr><th>Order</th><th>Status</th><th>Delivery</th><th>Link</th><th></th></tr></thead>
        <tbody>${orders.map((o) => html`<tr>
          <td><strong>${o.id}</strong><div class="muted small">${o.referring_doctor ?? ''}</div>
            <div class="muted small">${o.signed_at ? `Signed ${istDateTime(o.signed_at)}` : 'Not signed'}</div></td>
          <td>${orderStatusPill(o.status)}</td>
          <td>${deliveryPill(o.delivery)}
            ${o.delivery.state === 'failed' && o.delivery.error ? html`<div class="small muted">${o.delivery.error}</div>` : ''}
            ${o.delivery.rows.length ? html`<details><summary class="small">Attempts</summary><ul class="timeline">
              ${o.delivery.rows.map((m) => html`<li>${istDateTime(m.created_at)} · ${m.channel === 'sms' ? 'SMS' : 'WhatsApp'}: ${m.status}${m.error ? ` (${m.error})` : ''}${m.sent_by !== 'system' ? ' · by staff' : ''}</li>`)}
            </ul></details>` : ''}</td>
          <td class="small">${o.link ? html`${o.link.expired ? 'Expired' : `Expires ${istDateTime(o.link.expires_at)}`}<br>Opened ${o.link.open_count}×` : '–'}</td>
          <td>${o.status === 'processing' ? '' : html`<form method="post" action="/staff/orders/${o.id}/resend">${csrf(token)}
            <button class="btn small" type="submit">Resend link</button></form>
            <a class="small" href="/staff/log?order=${o.id}">Access log</a>`}</td></tr>`)}</tbody></table>`
        : html`<div class="empty"><strong>No orders</strong></div>`}</div>`,
  });
}

function importPage({ user, token, runs, demo, flash, result }) {
  return staffPage({
    title: 'LIS import', user, here: '/staff/import', token,
    body: html`<h1>LIS import</h1>
      <p class="muted">The LIS drops CSV exports into the export folder; the portal checks it every few seconds. You can also upload a file by hand.</p>
      ${flash ? html`<div class="banner ${flash.kind}" role="status"><p>${flash.text}</p></div>` : ''}
      ${result ? html`<div class="banner ${result.rowsFailed ? 'warn' : 'ok'}" role="status"><h2>${result.rowsFailed ? 'Imported with problems' : 'Imported'}</h2>
        <p>${result.rowsTotal} rows · ${result.ordersNew} new orders · ${result.ordersSigned} signed (links sent) · ${result.rowsFailed} rows rejected</p>
        ${result.errors.length ? html`<ul class="err-list">${result.errors.slice(0, 15).map((e) => html`<li>${e.order}${e.line ? ` (line ${e.line})` : ''}: ${e.message}</li>`)}</ul>` : ''}</div>` : ''}
      <div class="panel pad"><form method="post" action="/staff/import" enctype="multipart/form-data" class="toolbar">
        ${csrf(token)}<div class="grow"><label for="f">Upload a CSV export</label><input id="f" type="file" name="file" accept=".csv,text/csv" required></div>
        <button class="btn" type="submit">Import</button></form>
        <form method="post" action="/staff/import/scan" class="inline-form">${csrf(token)}<button class="btn secondary small" type="submit">Check the export folder now</button></form>
        ${demo ? html`<form method="post" action="/staff/import/demo-drop" class="inline-form">${csrf(token)}
          <button class="btn secondary small" type="submit">Demo: LIS signs off the next batch</button></form>` : ''}</div>
      <h2>Recent imports</h2>
      <div class="panel">${runs.length ? html`<table><thead><tr><th>When</th><th>File</th><th>Source</th><th>Rows</th><th>New</th><th>Signed</th><th>Rejected</th></tr></thead>
        <tbody>${runs.map((r) => html`<tr><td>${istDateTime(r.started_at)}</td><td>${r.filename}</td><td>${r.source}</td>
          <td class="num">${r.rows_total}</td><td class="num">${r.orders_new}</td><td class="num">${r.orders_signed}</td>
          <td class="num">${r.rows_failed ? html`<strong>${r.rows_failed}</strong>` : 0}
            ${r.errors.length ? html`<details><summary class="small">Why</summary><ul class="err-list">${r.errors.slice(0, 8).map((e) => html`<li>${e.order}: ${e.message}</li>`)}</ul></details>` : ''}</td></tr>`)}</tbody></table>`
        : html`<div class="empty"><strong>No imports yet</strong>Drop a CSV into the export folder or upload one above.</div>`}</div>`,
  });
}

function tasksPage({ user, token, open, done }) {
  return staffPage({
    title: 'Callbacks', user, here: '/staff/tasks', token,
    body: html`<h1>Critical value callbacks</h1>
      <p class="muted">A critical result has no automatic explanation. Call the patient or the referring doctor, then mark it done.</p>
      <div class="panel">${open.length ? html`<table><thead><tr><th>Order</th><th>Patient</th><th>Call</th><th>Doctor</th><th>Opened</th><th>Done</th></tr></thead>
        <tbody>${open.map((t) => html`<tr><td><strong>${t.order_id}</strong></td><td>${t.name}</td><td class="num">${t.mobile}</td><td>${t.referring_doctor ?? ''}</td>
          <td class="small">${istDateTime(t.created_at)}</td>
          <td><form method="post" action="/staff/tasks/${t.id}/done" class="toolbar m0">${csrf(token)}
            <input type="text" name="note" maxlength="200" placeholder="Note (who you spoke to)" aria-label="Note for ${t.order_id}">
            <button class="btn small" type="submit">Mark called</button></form></td></tr>`)}</tbody></table>`
        : html`<div class="empty"><strong>No open callbacks</strong>New critical results will appear here.</div>`}</div>
      ${done.length ? html`<h2>Recently done</h2><div class="panel"><table><thead><tr><th>Order</th><th>Patient</th><th>Done</th><th>By</th><th>Note</th></tr></thead>
        <tbody>${done.map((t) => html`<tr><td>${t.order_id}</td><td>${t.name}</td><td class="small">${istDateTime(t.done_at)}</td><td>${t.by ?? ''}</td><td>${t.note ?? ''}</td></tr>`)}</tbody></table></div>` : ''}`,
  });
}

function logPage({ user, token, rows, filters, actions, next }) {
  const qs = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v)).toString();
  return staffPage({
    title: 'Access log', user, here: '/staff/log', token,
    body: html`<h1>Access log</h1>
      <p class="muted">Every login, link open, report view, download and resend. Kept for DPDP accountability.</p>
      <form method="get" action="/staff/log" class="toolbar">
        <div><label for="o">Order ID</label><input id="o" type="text" name="order" value="${filters.order}" placeholder="ORD-71204"></div>
        <div><label for="a">Action</label><select id="a" name="action"><option value="">All</option>
          ${actions.map((a) => html`<option value="${a}" ${a === filters.action ? raw('selected') : ''}>${a}</option>`)}</select></div>
        <button class="btn" type="submit">Filter</button></form>
      <div class="panel">${rows.length ? html`<table><thead><tr><th>Time</th><th>Who</th><th>Action</th><th>Order</th><th>Detail</th><th>IP</th></tr></thead>
        <tbody>${rows.map((r) => html`<tr><td class="small num">${istDateTime(r.at)}</td><td class="small">${r.actor_type}${r.actor_ref ? ` · ${r.actor_ref}` : ''}</td>
          <td>${r.action}</td><td>${r.order_id ?? ''}</td><td class="small">${r.detail ?? ''}</td><td class="small muted">${r.ip ?? ''}</td></tr>`)}</tbody></table>`
        : html`<div class="empty"><strong>Nothing logged for this filter</strong></div>`}</div>
      ${next ? html`<div class="pager"><span></span><a href="/staff/log?${qs({ ...filters, before: next })}">Older →</a></div>` : ''}`,
  });
}

const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '–');

function reportPage({ user, token, days, m, daily }) {
  return staffPage({
    title: 'Delivery report', user, here: '/staff/report', token,
    body: html`<h1>Delivery and access report</h1>
      <p class="muted">Signed reports in the last
        ${[7, 30, 90].map((d) => html`<a href="/staff/report?days=${d}" ${d === days ? raw('aria-current="page"') : ''}>${d === days ? html`<strong>${d} days</strong>` : `${d} days`}</a> `)}</p>
      <div class="grid">
        <div class="stat"><div class="n">${m.signed}</div><div class="l">Reports signed</div></div>
        <div class="stat"><div class="n">${pct(m.digital, m.signed)}</div><div class="l">Delivered digitally (target 80%)</div></div>
        <div class="stat"><div class="n">${pct(m.opened, m.digital)}</div><div class="l">Of those, opened by the patient</div></div>
        <div class="stat"><div class="n">${m.failed}</div><div class="l">Failed on every channel</div></div>
        <div class="stat"><div class="n">${m.medianHours ?? '–'}${m.medianHours != null ? ' h' : ''}</div><div class="l">Median time from sign-off to first open</div></div>
        <div class="stat"><div class="n">${m.resends}</div><div class="l">Staff resends</div></div>
      </div>
      <h2>Safety and quality</h2>
      <div class="grid">
        <div class="stat"><div class="n">${m.callbacksOpen}</div><div class="l">Critical callbacks still open</div></div>
        <div class="stat"><div class="n">${m.callbackHours ?? '–'}${m.callbackHours != null ? ' h' : ''}</div><div class="l">Average time to complete a callback</div></div>
        <div class="stat"><div class="n">${m.otpFailed}</div><div class="l">Wrong or expired OTP attempts</div></div>
        <div class="stat"><div class="n">${m.linksExpiredHits}</div><div class="l">Expired or invalid link visits</div></div>
        <div class="stat"><div class="n">${m.flagged}</div><div class="l">Explanations flagged by patients</div></div>
        <div class="stat"><div class="n">${m.sumTemplate} / ${m.sumAi} / ${m.sumFallback}</div><div class="l">Summaries: template / AI / generic</div></div>
      </div>
      <h2>By day</h2>
      <div class="panel">${daily.length ? html`<table><thead><tr><th>Day</th><th>Signed</th><th>Delivered</th><th>Opened</th><th>Failed</th></tr></thead>
        <tbody>${daily.map((d) => html`<tr><td>${d.day}</td><td class="num">${d.signed}</td><td class="num">${d.delivered}</td><td class="num">${d.opened}</td><td class="num">${d.failed || 0}</td></tr>`)}</tbody></table>`
        : html`<div class="empty"><strong>No reports in this period</strong></div>`}</div>`,
  });
}

function reviewPage({ user, token, flagged, ai, sample, notice }) {
  const card = (item, withOwn) => html`<article class="card">
    <div class="head"><strong>${item.name}</strong> <span class="flag ${item.flag}">${item.flag === 'low' ? '▼ Low' : '▲ High'}</span>
      <span class="muted small"> · ${item.value} ${item.unit ?? ''} (range ${item.ref}) · source: ${item.source}${item.model ? ` ${item.model}` : ''}</span></div>
    ${['en', 'te', 'hi'].map((l) => html`<p lang="${l}" class="tight"><span class="tag">${l}</span>${item.texts[l] ?? ''}</p>`)}
    <form method="post" action="/staff/review/${item.result_id}" class="toolbar tight">${csrf(token)}
      <button class="btn small" name="decision" value="approve" type="submit">Approve</button>
      <button class="btn small danger" name="decision" value="reject" type="submit">Reject (use generic sentence)</button></form>
  </article>`;
  const section = (title, hint, items) => html`<h2>${title} (${items.length})</h2><p class="muted small">${hint}</p>
    ${items.length ? items.map((i) => card(i)) : html`<div class="panel"><div class="empty"><strong>Nothing to review</strong></div></div>`}`;
  return staffPage({
    title: 'Summary review', user, here: '/staff/review', token,
    body: html`<h1>Summary review</h1>
      <p class="muted">Patient identity is hidden here. Flags come from the report's own reference ranges; you are checking the wording only.</p>
      ${notice ? html`<div class="banner ok" role="status"><p>${notice}</p></div>` : ''}
      ${section('Flagged by patients', 'Hidden from patients until you decide.', flagged)}
      ${section('AI-written, not yet checked', 'Only for tests with no locked template. Patients see an "AI" label until you approve.', ai)}
      ${section('This week’s sample of 50', 'A stable random sample of locked-template summaries, for the weekly quality check.', sample)}`,
  });
}

function outboxPage({ rows }) {
  return staffPage({
    title: 'Message outbox', user: null, here: '',
    body: html`<h1>Mock message outbox <span class="muted small">(demo mode only)</span></h1>
      <p class="muted">Stands in for WhatsApp and SMS. Newest first. Cleared when the server restarts.</p>
      <div class="panel">${rows.length ? html`<table><thead><tr><th>Time</th><th>Channel</th><th>To</th><th>Message</th></tr></thead>
        <tbody>${rows.map((m) => html`<tr><td class="small num">${istDateTime(m.at)}</td><td>${m.channel}</td><td class="num">${m.mobile}</td>
          <td class="small pre">${m.body.split(/(https?:\/\/\S+)/).map((p) => (/^https?:/.test(p) ? html`<a href="${p}">${p}</a>` : p))}</td></tr>`)}</tbody></table>`
        : html`<div class="empty"><strong>No messages yet</strong></div>`}</div>`,
  });
}

module.exports = { loginPage, searchPage, patientPage, importPage, tasksPage, logPage, reportPage, reviewPage, outboxPage, staffPage, istDate };

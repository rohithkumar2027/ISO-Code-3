'use strict';
const { html, raw } = require('../lib/html');
const { t, LANGS, LANG_LABEL } = require('../i18n');

const ASSET_V = '1'; // bump when app.css changes, so phones refetch it

const dir = (lang) => (lang === 'en' ? 'ltr' : 'ltr');

/** Shared shell for patient-facing pages. `path` is used for the language switcher. */
function patientPage({ lang, title, body, path = '/', csrf = null, loggedIn = false, extraHead = null }) {
  return html`<!doctype html>
<html lang="${lang}" dir="${dir(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<meta name="referrer" content="same-origin">
<title>${title} · ${t(lang, 'brand')}</title>
<link rel="stylesheet" href="/app.css?v=${ASSET_V}">
${extraHead}
</head>
<body>
<div class="wrap">
  <header class="top">
    <a class="brand" href="/">Company A Diagnostics</a>
    <nav class="langs" aria-label="Language">
      ${LANGS.map((l) => html`<a href="${path}?lang=${l}" lang="${l}" ${l === lang ? raw('aria-current="true"') : ''}>${LANG_LABEL[l]}</a>`)}
    </nav>
  </header>
  <main id="main">${body}</main>
  ${loggedIn ? html`<form method="post" action="/logout" class="actions">
    <input type="hidden" name="_csrf" value="${csrf}">
    <button class="btn quiet" type="submit">${t(lang, 'logout')}</button></form>` : ''}
</div>
</body>
</html>`;
}

function errorPage(lang, titleKey, bodyKey, path = '/') {
  return patientPage({
    lang, path, title: t(lang, titleKey),
    body: html`<h1 class="page-title">${t(lang, titleKey)}</h1><p class="lede">${t(lang, bodyKey)}</p>
      <div class="actions"><a class="btn" href="/login">${t(lang, 'go_login')}</a></div>`,
  });
}

module.exports = { patientPage, errorPage, ASSET_V };

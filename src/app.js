'use strict';
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { parseCookies, RateLimiter } = require('./lib/web');
const { LANGS } = require('./i18n');
const { setCookie } = require('./lib/web');
const { MockProvider } = require('./services/messaging');
const aiClient = require('./services/summaries/ai');
const { apiRoutes } = require('./routes/api');

const WEB_DIST = path.join(__dirname, '..', 'web', 'dist');
const WEB_INDEX = path.join(WEB_DIST, 'index.html');

/**
 * Build the Express app. `ctx` = { cfg, db, provider, ai, limiter }.
 * Everything is injected so tests can run the whole app in memory.
 */
function createContext({ cfg, db, provider, ai }) {
  return {
    cfg, db,
    provider: provider ?? new MockProvider({ receiptDelayMs: cfg.deliveryReceiptDelayMs }),
    ai: ai === undefined ? aiClient.createClient(cfg.ai) : ai,
    limiter: new RateLimiter(),
  };
}

function createApp(ctx) {
  const { cfg } = ctx;
  const app = express();
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);

  // Static assets first: cacheable, no cookies needed.
  app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '7d', index: false })); // staff console CSS
  app.use(express.static(WEB_DIST, { maxAge: '1y', index: false })); // React app's hashed JS/CSS bundles

  // Security headers on every dynamic response. Health data must never be cached or leak via Referer.
  app.use((req, res, next) => {
    res.set({
      'Content-Security-Policy': "default-src 'none'; connect-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; script-src 'self'; img-src 'self' data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
      'Cache-Control': 'no-store',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'X-Frame-Options': 'DENY',
    });
    if (cfg.production) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  });

  app.use((req, res, next) => {
    req.cookies = parseCookies(req.headers.cookie);
    const q = typeof req.query.lang === 'string' ? req.query.lang : null;
    if (q && LANGS.includes(q)) {
      req.lang = q;
      setCookie(res, 'lang', q, { maxAgeSec: 31536000, secure: cfg.baseUrl.startsWith('https') });
    } else if (LANGS.includes(req.cookies.lang)) {
      req.lang = req.cookies.lang;
    } else {
      const al = String(req.headers['accept-language'] ?? '').slice(0, 2).toLowerCase();
      req.lang = LANGS.includes(al) ? al : 'en';
    }
    next();
  });

  app.use(express.json({ limit: '20kb' })); // React app (/api/*)
  app.use(express.urlencoded({ extended: false, limit: '20kb', parameterLimit: 20 })); // staff console forms

  // CSRF defence in depth (cookies are also SameSite=Lax): a cross-site POST is refused.
  app.use((req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') return next();
    const isApi = req.path.startsWith('/api/');
    const refuse = () => (isApi ? res.status(403).json({ error: 'forbidden' }) : res.status(403).send('Request refused: it did not look like it came from this site.'));
    const site = req.get('sec-fetch-site'); // sent by all current browsers
    if (site && site !== 'same-origin' && site !== 'none') return refuse();
    const origin = req.get('origin') || req.get('referer');
    if (origin && origin !== 'null') {
      let host = null;
      try { host = new URL(origin).host; } catch { /* malformed */ }
      if (host !== req.get('host')) return refuse();
    }
    next();
  });

  app.get('/healthz', (req, res) => res.json({ ok: true }));

  app.use('/api', apiRoutes(ctx));
  if (ctx.extraRoutes) for (const mount of ctx.extraRoutes) mount(app, ctx);

  app.use('/api', (req, res) => res.status(404).json({ error: 'not_found' }));

  // Everything else is the React patient app: client-side routing handles
  // /login, /reports, /r/:token, and its own not-found page.
  app.get('*', (req, res) => {
    if (req.path.startsWith('/staff') || req.path.startsWith('/dev')) return res.status(404).send('Not found');
    if (!fs.existsSync(WEB_INDEX)) {
      return res.status(503).send('The web app has not been built yet. Run "npm run build:web" (or "npm run dev:web" while developing).');
    }
    res.set('Cache-Control', 'no-store'); // index.html itself is never cached; its hashed asset links are
    res.sendFile(WEB_INDEX);
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.path}:`, err.message);
    const status = err.status && err.status < 500 ? err.status : 500;
    if (req.path.startsWith('/api/')) return res.status(status).json({ error: 'server_error' });
    res.status(status).send('Something went wrong. Please try again.');
  });
  return app;
}

module.exports = { createApp, createContext };

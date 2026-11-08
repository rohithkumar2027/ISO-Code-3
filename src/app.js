'use strict';
const path = require('node:path');
const express = require('express');
const { parseCookies, RateLimiter } = require('./lib/web');
const { LANGS } = require('./i18n');
const { setCookie } = require('./lib/web');
const { MockProvider } = require('./services/messaging');
const aiClient = require('./services/summaries/ai');
const { errorPage } = require('./views/layout');
const { patientRoutes } = require('./routes/patient');

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
  app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '7d', index: false }));

  // Security headers on every dynamic response. Health data must never be cached or leak via Referer.
  app.use((req, res, next) => {
    res.set({
      'Content-Security-Policy': "default-src 'none'; style-src 'self'; img-src 'self' data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'no-store',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'X-Frame-Options': 'DENY',
    });
    if (cfg.production) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  });

  app.use((req, res, next) => {
    req.cookies = parseCookies(req.headers.cookie);
    // Language: ?lang= beats cookie beats Accept-Language beats English
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

  app.use(express.urlencoded({ extended: false, limit: '20kb', parameterLimit: 20 }));

  // CSRF defence in depth (cookies are also SameSite=Lax): a cross-site POST is refused.
  app.use((req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') return next();
    const origin = req.get('origin') || req.get('referer');
    if (origin) {
      let host = null;
      try { host = new URL(origin).host; } catch { /* malformed */ }
      if (host !== req.get('host')) return res.status(403).send(String(errorPage(req.lang, 'err_title', 'err_body')));
    }
    next();
  });

  app.get('/healthz', (req, res) => res.json({ ok: true }));

  app.use(patientRoutes(ctx));
  if (ctx.extraRoutes) for (const mount of ctx.extraRoutes) mount(app, ctx);

  app.use((req, res) => res.status(404).send(String(errorPage(req.lang, 'nf_title', 'nf_body'))));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.path}:`, err.message);
    res.status(err.status && err.status < 500 ? err.status : 500)
      .send(String(errorPage(req.lang ?? 'en', 'err_title', 'err_body')));
  });
  return app;
}

module.exports = { createApp, createContext };

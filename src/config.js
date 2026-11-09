'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

// Tiny .env loader so no dependency is needed. Real environment variables win.
try {
  const file = path.join(root, '.env');
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && m[2] !== '' && !(m[1] in process.env)) process.env[m[1]] = m[2];
    }
  }
} catch { /* ignore */ }

const argv = process.argv.slice(2);

function build(overrides = {}) {
  const env = process.env;
  const production = env.NODE_ENV === 'production';
  const demo = overrides.demo ?? (argv.includes('--demo') || env.DEMO_MODE === '1');
  if (production && demo) throw new Error('DEMO_MODE must not be enabled in production');
  let secret = overrides.appSecret ?? env.APP_SECRET;
  if (!secret) {
    if (production) throw new Error('APP_SECRET is required in production');
    secret = crypto.randomBytes(32).toString('hex'); // ephemeral outside production
  }
  const port = Number(env.PORT || 3000);
  return {
    production,
    demo,
    port,
    baseUrl: (overrides.baseUrl ?? env.BASE_URL ?? `http://localhost:${port}`).replace(/\/$/, ''),
    appSecret: secret,
    dbFile: overrides.dbFile ?? env.DB_FILE ?? path.join(root, 'data', 'portal.db'),
    exportDir: overrides.exportDir ?? env.LIS_EXPORT_DIR ?? path.join(root, 'lis-export'),
    sampleDir: path.join(root, 'data', 'sample'),
    watchIntervalMs: overrides.watchIntervalMs ?? 5000,
    // Security parameters (rationale in docs/TDD.md)
    linkTtlMs: 72 * 3600 * 1000,
    otpTtlMs: 5 * 60 * 1000,
    otpMaxAttempts: 5,
    otpMaxSendsPerHour: 5,
    otpResendCooldownMs: overrides.otpResendCooldownMs ?? 30 * 1000,
    patientIdleMs: 20 * 60 * 1000,
    patientMaxMs: 2 * 3600 * 1000,
    staffIdleMs: 60 * 60 * 1000,
    staffMaxMs: 10 * 3600 * 1000,
    consentVersion: '2026-01',
    maxCsvBytes: 2 * 1024 * 1024,
    maxPdfBytes: 8 * 1024 * 1024,
    maxBroadcastRecipients: 2000,
    documentsDir: overrides.documentsDir ?? env.DOCUMENTS_DIR ?? path.join(root, 'data', 'documents'),
    deliveryReceiptDelayMs: overrides.deliveryReceiptDelayMs ?? 3000,
    ai: {
      key: overrides.aiKey ?? env.ANTHROPIC_API_KEY ?? '',
      model: env.ANTHROPIC_MODEL || 'claude-haiku-5-5',
      timeoutMs: 8000,
    },
    labName: 'Company A Diagnostics',
  };
}

module.exports = { build, root };

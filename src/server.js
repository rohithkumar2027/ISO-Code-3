'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { build } = require('./config');
const { open } = require('./db');
const { createApp, createContext } = require('./app');
const { startWatcher } = require('./services/ingest');
const { seedDemo } = require('./services/demo');
const sessions = require('./services/sessions');

const cfg = build();
const db = open(cfg.dbFile);
const ctx = createContext({ cfg, db });

if (cfg.demo) seedDemo(ctx);
fs.mkdirSync(cfg.exportDir, { recursive: true });

const app = createApp(ctx);
const server = app.listen(cfg.port, () => {
  console.log(`Report portal on ${cfg.baseUrl}  (demo: ${cfg.demo ? 'ON' : 'off'}, AI: ${ctx.ai ? ctx.ai.model : 'off, locked templates + safe fallback only'})`);
  console.log(`Watching ${path.resolve(cfg.exportDir)} for LIS CSV exports`);
  if (cfg.demo) console.log(`Demo: patient login at /login, staff at /staff, message outbox at /dev/outbox`);
});

const stopWatcher = startWatcher(ctx);
const purge = setInterval(() => sessions.purgeExpired(db, cfg.patientMaxMs + cfg.staffMaxMs), 3600_000);
purge.unref();

function shutdown() {
  stopWatcher();
  server.close(() => { db.close(); process.exit(0); });
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

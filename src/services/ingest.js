'use strict';
// Watches the LIS export folder. Each *.csv is imported, then moved to
// processed/ (or failed/ with a .error.txt next to it) so it is never read twice.
const fs = require('node:fs');
const path = require('node:path');
const { importCsv } = require('./importer');
const { processPending } = require('./delivery');
const { logAccess } = require('./audit');

let running = false;

function moveTo(dir, file, name) {
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(dir, `${stamp}_${name}`);
  fs.renameSync(file, dest);
  return dest;
}

/** One sweep of the export folder. Returns a list of per-file results. */
async function scanFolder(ctx) {
  if (running) return [];
  running = true;
  const { db, cfg } = ctx;
  const out = [];
  try {
    fs.mkdirSync(cfg.exportDir, { recursive: true });
    const files = fs.readdirSync(cfg.exportDir).filter((f) => f.toLowerCase().endsWith('.csv')).sort();
    for (const name of files) {
      const full = path.join(cfg.exportDir, name);
      let st;
      try { st = fs.statSync(full); } catch { continue; }
      if (!st.isFile()) continue;
      if (Date.now() - st.mtimeMs < 800) continue; // LIS may still be writing it
      if (st.size > cfg.maxCsvBytes) {
        fs.writeFileSync(`${moveTo(path.join(cfg.exportDir, 'failed'), full, name)}.error.txt`, `File is larger than ${cfg.maxCsvBytes} bytes`);
        logAccess(db, { type: 'system', action: 'import_failed', detail: `${name}: too large` });
        out.push({ name, error: 'too large' });
        continue;
      }
      try {
        const text = fs.readFileSync(full, 'utf8');
        const r = importCsv(db, { text, filename: name, source: 'folder' });
        moveTo(path.join(cfg.exportDir, 'processed'), full, name);
        logAccess(db, { type: 'system', action: 'import_ok', detail: `${name}: ${r.ordersNew} new, ${r.ordersSigned} signed, ${r.rowsFailed} bad rows` });
        out.push({ name, ...r });
      } catch (e) {
        const dest = moveTo(path.join(cfg.exportDir, 'failed'), full, name);
        fs.writeFileSync(`${dest}.error.txt`, e.message);
        logAccess(db, { type: 'system', action: 'import_failed', detail: `${name}: ${e.message}` });
        out.push({ name, error: e.message });
      }
    }
    await processPending(ctx); // also retries anything that failed earlier
  } finally {
    running = false;
  }
  return out;
}

function startWatcher(ctx) {
  const tick = () => scanFolder(ctx).catch((e) => console.error('ingest error:', e.message));
  const timer = setInterval(tick, ctx.cfg.watchIntervalMs);
  timer.unref();
  tick();
  return () => clearInterval(timer);
}

module.exports = { scanFolder, startWatcher };

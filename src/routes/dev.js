'use strict';
// Demo-only helpers. Mounted always, but every route 404s unless DEMO_MODE is on
// (and config refuses DEMO_MODE in production).
const V = require('../views/staff');

function mount(app, ctx) {
  app.get('/dev/outbox', (req, res) => {
    if (!ctx.cfg.demo) return res.status(404).send('Not found');
    res.send(String(V.outboxPage({ rows: ctx.provider.outbox.slice(0, 60) })));
  });
}

module.exports = { mount };

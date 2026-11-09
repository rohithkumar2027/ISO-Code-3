'use strict';
// Patient-facing pages moved to the React app (web/). This file now only
// holds the staff console's asset-cache-busting version (views/staff.js).
const ASSET_V = '1'; // bump when app.css changes, so phones refetch it

module.exports = { ASSET_V };

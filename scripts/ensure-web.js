#!/usr/bin/env node
'use strict';
// Builds the React app (web/) on first run so `npm start`/`npm run demo`
// just works, without making every backend `npm test` run pay for it.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const webDir = path.join(root, 'web');
const index = path.join(webDir, 'dist', 'index.html');

if (fs.existsSync(index) && !process.argv.includes('--force')) process.exit(0);

console.log('Building the web app (first run only; re-run with --force to rebuild)...');
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
// shell:true on Windows: npm.cmd is a batch file, which Windows can only run
// through a shell (not directly via CreateProcess, which spawnSync defaults to).
const run = (args) => execFileSync(npmCmd, args, { cwd: webDir, stdio: 'inherit', shell: process.platform === 'win32' });
if (!fs.existsSync(path.join(webDir, 'node_modules'))) run(['install', '--no-audit', '--no-fund']);
run(['run', 'build']);

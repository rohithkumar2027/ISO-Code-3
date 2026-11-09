# Deployment Guide: Report Portal

**Repository:** <https://github.com/rohithkumar2027/ISO-Code-3>
**Client:** Company A Diagnostics (Central Lab & Regional Diagnostic Network)
**Live app:** not deployed to a public host for this submission — run it locally with the steps below (one command, see "Run it locally").

---

## 0. Run it locally (step by step)

Needs Node.js 22.13+ and nothing else (no database server to install).

```bash
git clone https://github.com/rohithkumar2027/ISO-Code-3.git
cd ISO-Code-3
npm install
npm run demo
```

`npm run demo` also builds the React app on its first run (a few extra seconds), seeds three
staff accounts, copies a sample LIS export into `lis-export/` so the app isn't empty, and turns on
demo-only conveniences (the OTP code shown on screen, a message outbox). Then open
<http://localhost:3000>.

To run it in a normal (non-demo) configuration instead: copy `.env.example` to `.env`, fill in at
least `APP_SECRET` (see §3 below for how to generate one), then `npm start`.

Tests: `npm test` (backend) and `npm --prefix web test` (frontend) — no network, no setup needed.

## 0.1 Demo login details (for the reviewer)

| Who | How to sign in |
|---|---|
| **Patient** | Go to `/login`. Use mobile number `9000000001` (a family: two patients share this number) or `9000000002` (a critical result). Enter the mobile number; the one-time code is shown on screen in demo mode (and logged to the server console). |
| **Front desk** | Go to `/staff`. Username `frontdesk1`. |
| **Pathologist (staff console)** | Go to `/staff`. Username `pathologist1`. |
| **Operations** | Go to `/staff`. Username `ops1`. |
| **Doctor portal (React)** | Go to `/doctor/login`. Username `pathologist1` (same account as the staff console's pathologist). |

**All staff/doctor passwords are the same one value, randomly generated and printed to the server
console every time `npm run demo` starts** (look for the line `Demo staff accounts created
(password for all: ...)` right after boot) — never hard-coded in the repository or in this document.

A mock WhatsApp/SMS outbox is at `/dev/outbox` (demo mode only) — every link and OTP the app
"sends" shows up there, so the whole patient flow can be exercised without a real phone.

---

## 1. Overview & Architecture

The application is architected as an all-in-one Node.js service using Express and Node's built-in SQLite engine (`node:sqlite`). It has zero external database server dependencies (no Postgres, MySQL, or Redis required).

* **Backend:** Node.js (>=22.13), Express, SQLite with WAL mode.
* **Frontend:** Modern React SPA with Vite, Framer Motion, and server-rendered staff console.
* **Assets:** Static pre-compiled bundles served directly from `web/dist/` with long-term cache headers.
* **Process Model:** Single-process or cluster with shared volume for SQLite and LIS drop folder.

---

## 2. Prerequisites & System Requirements

| Resource | Minimum | Recommended |
|---|---|---|
| **Node.js** | 22.13.0 LTS | 22.19+ LTS |
| **CPU** | 1 vCPU | 2 vCPUs |
| **RAM** | 512 MB | 1 GB |
| **Disk** | 20 GB SSD | 50 GB SSD (for LIS CSV archive + SQLite DB) |
| **OS** | Ubuntu 22.04+ / Debian 12 / Alpine / Windows Server | Ubuntu 24.04 LTS |

---

## 3. Environment Variables Configuration

Copy `.env.example` to `.env` in the project root:

```bash
cp .env.example .env
```

### Production Configuration Parameters

```ini
# Server Port
PORT=3000

# Base URL (Public HTTPS domain where patients access links)
BASE_URL=https://reports.companya-diagnostics.com

# Cryptographic HMAC key for session cookies, OTP hashes, and CSRF tokens.
# Generate your own — never reuse an example value from a document like this one:
#   openssl rand -hex 32
APP_SECRET=

# SQLite Database File Path (Ensure directory is persistent and backed up)
DB_FILE=data/portal.db

# LIS Export Watched Directory (Folder where lab analyzers / LIS drop CSVs)
LIS_EXPORT_DIR=lis-export

# Production Flag (Strict security headers, HSTS, secure cookies)
NODE_ENV=production

# Trust Reverse Proxy (Set to 1 if behind Nginx, Cloudflare, AWS ALB)
TRUST_PROXY=1

# Optional AI Configuration (For unlisted biomarker clinical summaries)
ANTHROPIC_API_KEY=sk-ant-api03-...
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022
```

> [!IMPORTANT]
> `APP_SECRET` **must** be set to a strong, stable secret in production. If omitted, a random key is generated on boot, which will invalidate existing patient sessions and OTP tokens on every process restart.

---

## 4. Step-by-Step Production Setup

### Step 1: Clone the Repository
```bash
git clone https://github.com/rohithkumar2027/ISO-Code-3.git /var/www/report-portal
cd /var/www/report-portal
```

### Step 2: Install Dependencies & Build Frontend
```bash
# Install backend production dependencies
npm install --omit=dev

# Build the React web application bundle
node scripts/ensure-web.js --force
```

### Step 3: Run Automated Verification Tests
```bash
npm test
npm --prefix web test
```
*Ensure all 81 backend tests and 10 frontend unit tests pass before putting into service.*

### Step 4: Create Directories & Set Permissions
```bash
mkdir -p data lis-export
chmod 700 data
chmod 755 lis-export
```

---

## 5. Process Management (PM2)

Using [PM2](https://pm2.keymetrics.io/) ensures zero-downtime restarts and automatic boot recovery.

### Install PM2
```bash
npm install -g pm2
```

### Create `ecosystem.config.cjs`
```javascript
module.exports = {
  apps: [
    {
      name: 'report-portal',
      script: 'src/server.js',
      node_args: '--disable-warning=ExperimentalWarning',
      instances: 1, // SQLite WAL supports single-process writer natively
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    }
  ]
};
```

### Start & Save Process
```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

---

## 6. Reverse Proxy Configuration (Nginx + SSL)

Install Nginx and Certbot for automated Let's Encrypt SSL/TLS certificates:

```bash
sudo apt update && sudo apt install -y nginx certbot python3-certbot-nginx
```

### Nginx Site Configuration (`/etc/nginx/sites-available/report-portal`)

```nginx
server {
    listen 80;
    server_name reports.companya-diagnostics.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name reports.companya-diagnostics.com;

    ssl_certificate /etc/letsencrypt/live/reports.companya-diagnostics.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/reports.companya-diagnostics.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Maximum CSV upload size for staff LIS imports
    client_max_body_size 5M;

    # Static Assets Caching (Served directly by Nginx or proxied with immutable headers)
    location /assets/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Application Proxy
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Enable Site and Obtain Certificate
```bash
sudo ln -s /etc/nginx/sites-available/report-portal /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d reports.companya-diagnostics.com
```

---

## 7. Cloud Deployment Alternatives

### Docker Deployment
Create `Dockerfile`:
```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN node scripts/ensure-web.js --force
VOLUME ["/app/data", "/app/lis-export"]
EXPOSE 3000
CMD ["node", "--disable-warning=ExperimentalWarning", "src/server.js"]
```

Run with persistent storage mount:
```bash
docker build -t companya-report-portal .
docker run -d \
  --name report-portal \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/lis-export:/app/lis-export \
  --env-file .env \
  companya-report-portal
```

### Railway / Render
1. Connect GitHub repository.
2. Build Command: `node scripts/ensure-web.js --force`
3. Start Command: `node --disable-warning=ExperimentalWarning src/server.js`
4. Attach a **Persistent Disk** mounted at `/app/data` to preserve the SQLite database.
5. Set environment variables (`NODE_ENV=production`, `APP_SECRET=...`, `BASE_URL=...`).

---

## 8. LIS Integration & Data Ingestion

In production, laboratory analyzers or the main LIS drop CSV batch exports into the watched directory:

1. **SFTP Drop**: Laboratory servers push CSV batches via automated SFTP script to `/var/www/report-portal/lis-export/`.
2. **Atomic Processing**: The built-in folder watcher (`src/services/ingest.js`) detects files, ignores incomplete writes ($< 1$s old), processes rows inside an atomic SQLite transaction, and moves processed files to `lis-export/archive/`.
3. **Manual Fallback**: Front desk staff can also manually upload CSVs through the authenticated web console at `/staff/importer`.

---

## 9. Backup & Disaster Recovery

Since all state is stored in SQLite:
* **Online Backup**: SQLite can be backed up while the server is running without taking it offline using SQLite's native backup command:
  ```bash
  sqlite3 data/portal.db ".backup 'data/backup-$(date +%Y%m%d%H%M).db'"
  ```
* **Daily Cron Job**:
  ```bash
  # /etc/cron.daily/backup-portal
  #!/bin/bash
  BACKUP_DIR="/var/backups/report-portal"
  mkdir -p $BACKUP_DIR
  sqlite3 /var/www/report-portal/data/portal.db ".backup '$BACKUP_DIR/portal-$(date +%F).db'"
  find $BACKUP_DIR -name "portal-*.db" -mtime +30 -delete
  ```

---

## 10. Health Monitoring & Security Checklist

* **Health Probe**: `GET /healthz` returns `{"ok": true}` (HTTP 200). Use for Uptime Kuma, Datadog, or AWS Route53 health checks.
* **Security Headers**: Content-Security-Policy (CSP), Strict-Transport-Security (HSTS), X-Content-Type-Options, Referrer-Policy, and X-Frame-Options are automatically applied to every request.
* **DPDP Act Compliance**: All access events (patient logins, link creations, PDF downloads, staff reviews) are appended to the immutable `access_log` table with timestamps, IP addresses, and masked phone numbers.


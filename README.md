# Report portal for a diagnostic lab chain

Patients should never have to call the lab to ask about a report. When the pathologist signs, the
patient gets a safe, expiring link on WhatsApp or SMS, opens it with a one-time code, and reads a
short plain-language explanation in English, Telugu or Hindi.

Repository: <https://github.com/rohithkumar2027/ISO-Code-3> · Design document: [docs/TDD.md](docs/TDD.md)

**What works end to end (the "core build" slice, plus extras)**

| Step | Where |
|---|---|
| LIS CSV import from a watched folder or a manual upload, with row-level error reporting | `src/services/importer.js`, `ingest.js`, staff **LIS import** |
| Automatic link on sign-off (WhatsApp first, SMS fallback, delivery status tracked) | `src/services/delivery.js`, `messaging.js` |
| Secure expiring links: 256-bit token, stored hashed, 72 h expiry, **OTP to the number on file on every open** | `links.js`, `otp.js`, `routes/api.js` |
| Patient portal (React, editorial design): mobile + OTP login, DPDP consent, order list with status, report view, PDF download | `web/`, `/login`, `/reports` |
| Plain-language summary of out-of-range values in en / te / hi, rule-based flags, locked templates for 30 tests, validated AI for the rest, patient "looks wrong" flag | `src/services/summaries/` |
| Critical values: no summary, banner for the patient, callback task for staff | `delivery.js`, `/staff/tasks` |
| Front desk: find a patient, resend link, delivery status per message, access log | `/staff` |
| Operations: delivery and access report | `/staff/report` |
| Pathologist: review flagged, AI-written and weekly-sample summaries | `/staff/review` |

Not built: the referring-doctor 90-day view (optional in the brief). See "Limits" in the TDD.

## Two front ends, one backend

The **patient app** (`web/`) is a React single-page app with an editorial design — warm ivory
background, deep forest-green accents, oversized serif headings, rounded cards, subtle motion. It
talks to the Express backend only through a JSON API (`/api/*`); all the security logic (hashed
OTPs and link tokens, server-side sessions, CSRF, the DPDP consent gate, the access log) lives
unchanged in `src/services/`, exactly as before.

The **staff console** (front desk, pathologist, operations) stayed server-rendered Express/HTML —
it's an internal tool used at a front desk, not the patient-facing "website" the redesign was
about, and rebuilding it too would have doubled the work for no benefit the brief asked for.

One deliberate trade-off: the original server-rendered patient pages were a few KB and shipped no
JavaScript at all, for patients on weak data. The React app is heavier — about **100 KB gzipped of
JavaScript**, one load, cached after that — because an SPA with animation needs a framework and a
router. It still ships **no images or webfonts** (the "beautiful imagery" is original inline SVG
line art, not stock photography) to keep that cost as low as it reasonably can be. This is called
out in [docs/TDD.md](docs/TDD.md) as a named trade-off, not a silent regression.

## Run it

Needs Node.js 22.13 or newer. No database server: it uses the SQLite built into Node.

```bash
npm install
npm run demo
```

The first run also builds the React app (`web/`) automatically — that takes a few extra seconds
once. Demo mode does three more things, and refuses to run in production:

1. Creates three staff accounts and **prints their throw-away password in the console** (nothing is stored in the repository).
2. Copies the sample LIS export into `lis-export/` (dates shifted so the newest sign-off is "just now"). The folder watcher imports it and "sends" the links.
3. Shows the one-time code on the OTP screen and exposes a message outbox at <http://localhost:3000/dev/outbox> that stands in for WhatsApp/SMS.

### Five-minute tour

1. **Outbox** (`/dev/outbox`): see the WhatsApp message with the link for each signed order.
2. **Patient, link route**: open a link from the outbox → press *Send code* → enter the code shown → agree to consent → the report opens. A link preview or a forwarded link alone shows nothing.
3. **Patient, login route**: `/login` with `9000000001` (a family: Lakshmi and Venkata Rao share one number). Switch the language chips (English / తెలుగు / हिन्दी) on the report. Try *This explanation looks wrong*.
4. **Critical**: log in as `9000000002` (Farzana Begum, potassium 6.8). The report shows an urgent banner and **no explanation**.
5. **Front desk** (`/staff`, user `frontdesk1`): search "Irfan" (WhatsApp failed → SMS fallback), "Sunitha" (both channels failed → listed on the home screen), resend a link, open **Callbacks** and complete the critical one, open **Access log**.
6. **Sign-off automation**: **LIS import → "Demo: LIS signs off the next batch"**. Venkata Rao's cholesterol order flips from *Being prepared* to *Ready* and a link goes out. The batch also contains two deliberately bad rows; see how they are reported.
7. **Pathologist** (`pathologist1`): review the flagged summary. **Ops** (`ops1`): delivery report.

Demo patient numbers (all fictional): `9000000001`–`9000000008`; `…13` simulates "not on WhatsApp", `…99` simulates an unreachable number.

### Tests

```bash
npm test          # backend: 80 node:test cases (unit + full HTTP API, JSON responses)
npm --prefix web test   # frontend: Vitest + React Testing Library
```

No network, no external services. Backend: rules engine, importer, OTP, links, sessions,
summaries and AI guardrails, plus HTTP-level tests driving the real app and `/api/*` for the
patient and staff journeys — access control, IDOR, CSRF, rate limits, secret handling. Frontend:
i18n coverage across all three languages, the range-bar component's edge cases, and the login
form's error handling (invalid number, wrong OTP, rate-limited).

## Configuration

Copy `.env.example` to `.env` (git-ignored). Everything has a safe default for local use.

| Variable | Purpose |
|---|---|
| `APP_SECRET` | Required in production (HMAC key for OTPs and cookies). Random per run otherwise. |
| `BASE_URL` | Public URL placed in report links. |
| `LIS_EXPORT_DIR` | Folder the LIS drops CSV files into (default `./lis-export`). |
| `DB_FILE` | SQLite file (default `data/portal.db`, git-ignored). |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` | Optional. Enables AI wording for tests that have no locked template. Without it those fall back to a safe generic sentence. |
| `DEMO_MODE=1` | Same as `--demo`. Rejected when `NODE_ENV=production`. |
| `TRUST_PROXY` | Set to `1` behind a reverse proxy so client IPs in the access log are correct. |

## Layout

```
src/
  app.js, server.js        Express app (security headers, CSRF, API + SPA + staff routing), entry point
  config.js, db.js         Settings and SQLite (schema in schema.sql)
  routes/                  api.js (JSON, for the React app), staff.js (console), dev.js (demo outbox)
  services/                importer, ingest (folder watcher), delivery (sign-off automation),
                           links, otp, sessions, messaging (mock), summaries/, pdf, metrics, audit
  views/                   Server-rendered staff-console pages (auto-escaping html`` helper)
  i18n.js                  Staff-console strings (the React app has its own, in web/src/i18n.js)
public/app.css             Staff console's only stylesheet. No JavaScript there either.
web/                       React patient app (Vite). See "Two front ends, one backend" above.
  src/pages/, components/  Screens and shared UI (buttons, cards, the range-bar SVG, the OTP form)
  src/lib/api.js           Thin fetch wrapper for /api/*; src/lib/SessionContext.jsx owns session state
  src/i18n.js              Patient strings in en / te / hi
  dist/                    Build output (git-ignored); Express serves it directly, no separate server
data/sample/               Fictional LIS exports used by demo mode and the tests
test/                      node:test suites (backend); web/src/**/*.test.jsx (frontend, Vitest)
docs/TDD.md                Technical design, assumptions, security model, limits
```

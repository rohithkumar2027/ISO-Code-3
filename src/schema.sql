PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS patients (
  id          INTEGER PRIMARY KEY,
  mobile      TEXT NOT NULL,              -- 10-digit Indian mobile; one number can cover a family
  name        TEXT NOT NULL,
  name_key    TEXT NOT NULL,              -- lower-cased, squashed, used for matching
  age         INTEGER,
  sex         TEXT,
  created_at  TEXT NOT NULL,
  UNIQUE (mobile, name_key)
);
CREATE INDEX IF NOT EXISTS idx_patients_mobile ON patients (mobile);

CREATE TABLE IF NOT EXISTS orders (
  id               TEXT PRIMARY KEY,      -- e.g. ORD-71204
  patient_id       INTEGER NOT NULL REFERENCES patients(id),
  status           TEXT NOT NULL CHECK (status IN ('processing','ready','ready_critical')),
  referring_doctor TEXT,
  collected_at     TEXT,
  signed_at        TEXT,
  imported_at      TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  delivered_at     TEXT                   -- first time an automatic link was triggered
);
CREATE INDEX IF NOT EXISTS idx_orders_patient ON orders (patient_id);

CREATE TABLE IF NOT EXISTS results (
  id          INTEGER PRIMARY KEY,
  order_id    TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  parameter   TEXT NOT NULL,              -- as exported, e.g. "Haemoglobin g/dL"
  name        TEXT NOT NULL,              -- "Haemoglobin"
  unit        TEXT,                       -- "g/dL"
  value_raw   TEXT NOT NULL,
  value_num   REAL,
  ref_raw     TEXT,
  ref_low     REAL,
  ref_high    REAL,
  flag        TEXT NOT NULL CHECK (flag IN ('normal','low','high','unknown'))
);
CREATE INDEX IF NOT EXISTS idx_results_order ON results (order_id);

CREATE TABLE IF NOT EXISTS import_runs (
  id            INTEGER PRIMARY KEY,
  source        TEXT NOT NULL,            -- 'folder' | 'upload'
  filename      TEXT NOT NULL,
  file_hash     TEXT NOT NULL,
  started_at    TEXT NOT NULL,
  rows_total    INTEGER NOT NULL DEFAULT 0,
  rows_failed   INTEGER NOT NULL DEFAULT 0,
  orders_new    INTEGER NOT NULL DEFAULT 0,
  orders_signed INTEGER NOT NULL DEFAULT 0,
  errors        TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS report_links (
  id              INTEGER PRIMARY KEY,
  order_id        TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  token_hash      TEXT NOT NULL UNIQUE,   -- SHA-256 of the token; the token itself is never stored
  created_at      TEXT NOT NULL,
  expires_at      TEXT NOT NULL,
  revoked_at      TEXT,
  created_by      TEXT NOT NULL,          -- 'system' or 'staff:<id>'
  open_count      INTEGER NOT NULL DEFAULT 0,
  first_opened_at TEXT
);

CREATE TABLE IF NOT EXISTS otps (
  id          INTEGER PRIMARY KEY,
  mobile      TEXT NOT NULL,
  purpose     TEXT NOT NULL CHECK (purpose IN ('login','link')),
  link_id     INTEGER REFERENCES report_links(id),
  code_hash   TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  consumed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_otps_mobile ON otps (mobile, created_at);

CREATE TABLE IF NOT EXISTS staff_users (
  id            INTEGER PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('frontdesk','pathologist','ops')),
  password_hash TEXT NOT NULL,
  active        INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS sessions (
  id_hash     TEXT PRIMARY KEY,
  kind        TEXT NOT NULL CHECK (kind IN ('patient','staff')),
  mobile      TEXT,
  staff_id    INTEGER REFERENCES staff_users(id),
  csrf        TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  last_seen   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS accounts (
  mobile            TEXT PRIMARY KEY,
  lang              TEXT NOT NULL DEFAULT 'en',
  consent_version   TEXT,
  consented_at      TEXT,
  withdrawn_at      TEXT
);

CREATE TABLE IF NOT EXISTS messages (
  id          INTEGER PRIMARY KEY,
  order_id    TEXT REFERENCES orders(id) ON DELETE CASCADE,
  mobile      TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('report_link','otp')),
  channel     TEXT NOT NULL CHECK (channel IN ('whatsapp','sms')),
  link_id     INTEGER REFERENCES report_links(id),
  status      TEXT NOT NULL CHECK (status IN ('queued','sent','delivered','failed')),
  error       TEXT,
  sent_by     TEXT NOT NULL,              -- 'system' or 'staff:<id>'
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_order ON messages (order_id);

CREATE TABLE IF NOT EXISTS tasks (
  id          INTEGER PRIMARY KEY,
  kind        TEXT NOT NULL,              -- 'critical_callback'
  order_id    TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','done')),
  note        TEXT,
  created_at  TEXT NOT NULL,
  done_at     TEXT,
  done_by     INTEGER REFERENCES staff_users(id),
  UNIQUE (kind, order_id)
);

CREATE TABLE IF NOT EXISTS summaries (
  id            INTEGER PRIMARY KEY,
  order_id      TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  result_id     INTEGER NOT NULL REFERENCES results(id) ON DELETE CASCADE,
  lang          TEXT NOT NULL CHECK (lang IN ('en','te','hi')),
  text          TEXT NOT NULL,
  source        TEXT NOT NULL CHECK (source IN ('template','ai','fallback')),
  model         TEXT,
  status        TEXT NOT NULL DEFAULT 'shown' CHECK (status IN ('shown','flagged','approved','rejected')),
  created_at    TEXT NOT NULL,
  reviewed_by   INTEGER REFERENCES staff_users(id),
  reviewed_at   TEXT,
  UNIQUE (result_id, lang)
);

CREATE TABLE IF NOT EXISTS summary_flags (
  id          INTEGER PRIMARY KEY,
  summary_id  INTEGER NOT NULL REFERENCES summaries(id) ON DELETE CASCADE,
  mobile      TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  UNIQUE (summary_id, mobile)
);

CREATE TABLE IF NOT EXISTS access_log (
  id          INTEGER PRIMARY KEY,
  at          TEXT NOT NULL,
  actor_type  TEXT NOT NULL CHECK (actor_type IN ('patient','staff','system','anonymous')),
  actor_ref   TEXT,                       -- masked mobile or staff username
  action      TEXT NOT NULL,
  order_id    TEXT,
  detail      TEXT,
  ip          TEXT,
  ua          TEXT
);
CREATE INDEX IF NOT EXISTS idx_access_at ON access_log (at);
CREATE INDEX IF NOT EXISTS idx_access_order ON access_log (order_id);

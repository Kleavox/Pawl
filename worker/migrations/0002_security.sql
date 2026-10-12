ALTER TABLE users ADD COLUMN auth_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN last_login_at TEXT;
ALTER TABLE users ADD COLUMN disabled_at TEXT;

CREATE UNIQUE INDEX idx_users_email_normalized ON users(lower(email));

CREATE TABLE auth_events (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  ip_hash TEXT,
  user_agent TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_auth_events_user_id_created_at
  ON auth_events(user_id, created_at);
CREATE INDEX idx_auth_events_event_type_created_at
  ON auth_events(event_type, created_at);

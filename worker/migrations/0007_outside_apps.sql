CREATE TABLE outside_apps (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  title TEXT NOT NULL,
  origin TEXT NOT NULL,
  access TEXT NOT NULL CHECK (access IN ('public', 'visitor', 'owner')),
  client_id TEXT NOT NULL UNIQUE REFERENCES oauth_clients(id) ON DELETE CASCADE,
  card INTEGER NOT NULL DEFAULT 0 CHECK (card IN (0, 1)),
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

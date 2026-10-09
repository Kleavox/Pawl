CREATE TABLE oauth_clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  homepage TEXT,
  redirect_uris TEXT NOT NULL,
  allowed_scopes TEXT NOT NULL,
  confidential INTEGER NOT NULL DEFAULT 1 CHECK (confidential IN (0, 1)),
  first_party INTEGER NOT NULL DEFAULT 0 CHECK (first_party IN (0, 1)),
  secret_hash TEXT,
  sector TEXT NOT NULL,
  approved_at TEXT,
  disabled_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE oauth_grants (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL REFERENCES oauth_clients(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  scopes TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at TEXT,
  UNIQUE (user_id, client_id),
  UNIQUE (client_id, subject)
);

CREATE TABLE oauth_codes (
  code_hash TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES oauth_clients(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  redirect_uri TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  nonce TEXT,
  scopes TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);

CREATE TABLE oauth_refresh_tokens (
  token_hash TEXT PRIMARY KEY,
  grant_id TEXT NOT NULL REFERENCES oauth_grants(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  replaced_by TEXT
);

CREATE INDEX oauth_grants_user ON oauth_grants(user_id);
CREATE INDEX oauth_codes_expires ON oauth_codes(expires_at);
CREATE INDEX oauth_refresh_grant ON oauth_refresh_tokens(grant_id);

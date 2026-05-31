CREATE TABLE IF NOT EXISTS instances (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  branch TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  auto_restart BOOLEAN NOT NULL DEFAULT TRUE,
  max_fps INTEGER NOT NULL DEFAULT 60,
  log_stats_ms INTEGER,
  log_level TEXT,
  addon_temp_dir TEXT NOT NULL,
  status TEXT NOT NULL,
  last_started_at TIMESTAMPTZ,
  restart_count INTEGER NOT NULL DEFAULT 0,
  config_path TEXT NOT NULL,
  profile_path TEXT NOT NULL,
  battleye_path TEXT NOT NULL,
  alerts JSONB NOT NULL DEFAULT '{}'::jsonb,
  discord_status_message_id TEXT,
  discord_bot_status_message_id TEXT,
  last_low_fps_alert_at TIMESTAMPTZ,
  last_low_fps_recovery_at TIMESTAMPTZ,
  last_memory_alert_at TIMESTAMPTZ,
  last_status_embed_at TIMESTAMPTZ,
  last_known_player_count INTEGER,
  last_join_leave_scan_at TIMESTAMPTZ,
  discord_bot_crash_ping_at TIMESTAMPTZ,
  discord_bot_empty_since TIMESTAMPTZ,
  discord_bot_seed_ping_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS missions (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  scenario_id TEXT NOT NULL,
  source TEXT NOT NULL,
  required_mod_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  required_mods JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS panel_settings (
  id SMALLINT PRIMARY KEY CHECK (id = 1),
  data JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS bot_runtime (
  id SMALLINT PRIMARY KEY CHECK (id = 1),
  data JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS audit (
  id SERIAL PRIMARY KEY,
  at TIMESTAMPTZ NOT NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('master', 'admin', 'operator', 'viewer')),
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  disabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  last_login_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS users_email_lower_idx ON users (lower(email));

CREATE TABLE IF NOT EXISTS panel_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS panel_sessions_user_idx ON panel_sessions (user_id);

CREATE TABLE IF NOT EXISTS login_attempts (
  email TEXT NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL,
  success BOOLEAN NOT NULL DEFAULT FALSE,
  ip TEXT
);

CREATE INDEX IF NOT EXISTS login_attempts_email_idx ON login_attempts (email, attempted_at DESC);

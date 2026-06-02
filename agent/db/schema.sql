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
  discord_bot_seed_ping_at TIMESTAMPTZ,
  rotation JSONB NOT NULL DEFAULT '{}'::jsonb
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

CREATE TABLE IF NOT EXISTS host_metric_samples (
  id BIGSERIAL PRIMARY KEY,
  sampled_at TIMESTAMPTZ NOT NULL,
  cpu_percent REAL,
  memory_percent REAL,
  memory_used_mb INTEGER,
  memory_total_mb INTEGER,
  load1 REAL,
  load5 REAL,
  load15 REAL,
  disk_free_gb REAL,
  disk_used_percent REAL,
  players_online INTEGER,
  instances_running INTEGER,
  instances_total INTEGER,
  instance_ram_mb INTEGER,
  ingress_mbps REAL,
  egress_mbps REAL,
  network_iface TEXT
);

CREATE INDEX IF NOT EXISTS host_metric_samples_time_idx ON host_metric_samples (sampled_at DESC);

CREATE TABLE IF NOT EXISTS instance_metric_samples (
  id BIGSERIAL PRIMARY KEY,
  instance_id TEXT NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
  sampled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL,
  fps REAL,
  memory_mb INTEGER,
  cpu_percent REAL,
  player_count INTEGER,
  max_players INTEGER,
  a2s_listed BOOLEAN,
  a2s_latency_ms INTEGER,
  disk_profile_mb INTEGER,
  systemd_active BOOLEAN,
  uptime_sec INTEGER,
  host_load1 REAL,
  host_memory_percent REAL
);

CREATE INDEX IF NOT EXISTS instance_metric_samples_instance_time_idx
  ON instance_metric_samples (instance_id, sampled_at DESC);

CREATE TABLE IF NOT EXISTS instance_metric_events (
  id BIGSERIAL PRIMARY KEY,
  instance_id TEXT NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
  at TIMESTAMPTZ NOT NULL,
  kind TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS instance_metric_events_instance_time_idx
  ON instance_metric_events (instance_id, at DESC);

ALTER TABLE host_metric_samples ADD COLUMN IF NOT EXISTS ingress_mbps REAL;
ALTER TABLE host_metric_samples ADD COLUMN IF NOT EXISTS egress_mbps REAL;
ALTER TABLE host_metric_samples ADD COLUMN IF NOT EXISTS network_iface TEXT;

ALTER TABLE instances ADD COLUMN IF NOT EXISTS rotation JSONB NOT NULL DEFAULT '{}'::jsonb;

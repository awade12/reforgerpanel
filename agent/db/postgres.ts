import fs from "fs";
import path from "path";
import { Pool, type PoolClient } from "pg";
import type { AuditEntry, InstanceRecord, MissionMeta } from "../../lib/shared/types";
import { defaultInstanceRotation } from "../../lib/shared/rotation";
import {
  defaultBotRuntime,
  defaultSettings,
  defaultStore,
  normalizeInstance,
  normalizeStore,
  type PanelStore,
} from "./shared";
import { hydrateStoreSecrets, sealStoreSecrets } from "./secret-storage";

let pool: Pool | null = null;

export function databaseUrl() {
  return process.env.DATABASE_URL?.trim() ?? "";
}

export function usePostgres() {
  return Boolean(databaseUrl());
}

export function getPool() {
  if (!pool) {
    const url = databaseUrl();
    if (!url) throw new Error("DATABASE_URL is not configured");
    pool = new Pool({ connectionString: url, max: 10 });
  }
  return pool;
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export async function ensureSchema() {
  const schemaPath = path.join(__dirname, "schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf8");
  await getPool().query(sql);
}

function rowToInstance(row: Record<string, unknown>): InstanceRecord {
  return normalizeInstance({
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    branch: row.branch as InstanceRecord["branch"],
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
    autoRestart: Boolean(row.auto_restart),
    maxFps: Number(row.max_fps),
    logStatsMs: row.log_stats_ms == null ? null : Number(row.log_stats_ms),
    logLevel: row.log_level == null ? null : String(row.log_level),
    addonTempDir: String(row.addon_temp_dir),
    status: row.status as InstanceRecord["status"],
    lastStartedAt: row.last_started_at ? new Date(String(row.last_started_at)).toISOString() : null,
    restartCount: Number(row.restart_count),
    configPath: String(row.config_path),
    profilePath: String(row.profile_path),
    battleyePath: String(row.battleye_path),
    alerts: typeof row.alerts === "string" ? JSON.parse(row.alerts) : (row.alerts as InstanceRecord["alerts"]),
    discordStatusMessageId: row.discord_status_message_id == null ? null : String(row.discord_status_message_id),
    discordBotStatusMessageId:
      row.discord_bot_status_message_id == null ? null : String(row.discord_bot_status_message_id),
    lastLowFpsAlertAt: row.last_low_fps_alert_at ? new Date(String(row.last_low_fps_alert_at)).toISOString() : null,
    lastLowFpsRecoveryAt: row.last_low_fps_recovery_at
      ? new Date(String(row.last_low_fps_recovery_at)).toISOString()
      : null,
    lastMemoryAlertAt: row.last_memory_alert_at ? new Date(String(row.last_memory_alert_at)).toISOString() : null,
    lastStatusEmbedAt: row.last_status_embed_at ? new Date(String(row.last_status_embed_at)).toISOString() : null,
    lastKnownPlayerCount: row.last_known_player_count == null ? null : Number(row.last_known_player_count),
    lastJoinLeaveScanAt: row.last_join_leave_scan_at
      ? new Date(String(row.last_join_leave_scan_at)).toISOString()
      : null,
    discordBotCrashPingAt: row.discord_bot_crash_ping_at
      ? new Date(String(row.discord_bot_crash_ping_at)).toISOString()
      : null,
    discordBotEmptySince: row.discord_bot_empty_since
      ? new Date(String(row.discord_bot_empty_since)).toISOString()
      : null,
    discordBotSeedPingAt: row.discord_bot_seed_ping_at
      ? new Date(String(row.discord_bot_seed_ping_at)).toISOString()
      : null,
    rotation:
      typeof row.rotation === "string"
        ? JSON.parse(row.rotation)
        : ((row.rotation as InstanceRecord["rotation"]) ?? defaultInstanceRotation()),
  });
}

const INSTANCE_UPSERT = `
INSERT INTO instances (
  id, name, slug, branch, created_at, updated_at, auto_restart, max_fps, log_stats_ms, log_level,
  addon_temp_dir, status, last_started_at, restart_count, config_path, profile_path, battleye_path,
  alerts, discord_status_message_id, discord_bot_status_message_id, last_low_fps_alert_at,
  last_low_fps_recovery_at, last_memory_alert_at, last_status_embed_at, last_known_player_count,
  last_join_leave_scan_at, discord_bot_crash_ping_at, discord_bot_empty_since, discord_bot_seed_ping_at,
  rotation
) VALUES (
  $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, slug = EXCLUDED.slug, branch = EXCLUDED.branch, updated_at = EXCLUDED.updated_at,
  auto_restart = EXCLUDED.auto_restart, max_fps = EXCLUDED.max_fps, log_stats_ms = EXCLUDED.log_stats_ms,
  log_level = EXCLUDED.log_level, addon_temp_dir = EXCLUDED.addon_temp_dir, status = EXCLUDED.status,
  last_started_at = EXCLUDED.last_started_at, restart_count = EXCLUDED.restart_count,
  config_path = EXCLUDED.config_path, profile_path = EXCLUDED.profile_path, battleye_path = EXCLUDED.battleye_path,
  alerts = EXCLUDED.alerts, discord_status_message_id = EXCLUDED.discord_status_message_id,
  discord_bot_status_message_id = EXCLUDED.discord_bot_status_message_id,
  last_low_fps_alert_at = EXCLUDED.last_low_fps_alert_at, last_low_fps_recovery_at = EXCLUDED.last_low_fps_recovery_at,
  last_memory_alert_at = EXCLUDED.last_memory_alert_at, last_status_embed_at = EXCLUDED.last_status_embed_at,
  last_known_player_count = EXCLUDED.last_known_player_count, last_join_leave_scan_at = EXCLUDED.last_join_leave_scan_at,
  discord_bot_crash_ping_at = EXCLUDED.discord_bot_crash_ping_at, discord_bot_empty_since = EXCLUDED.discord_bot_empty_since,
  discord_bot_seed_ping_at = EXCLUDED.discord_bot_seed_ping_at, rotation = EXCLUDED.rotation
`;

function instanceParams(instance: InstanceRecord) {
  return [
    instance.id,
    instance.name,
    instance.slug,
    instance.branch,
    instance.createdAt,
    instance.updatedAt,
    instance.autoRestart,
    instance.maxFps,
    instance.logStatsMs,
    instance.logLevel,
    instance.addonTempDir,
    instance.status,
    instance.lastStartedAt,
    instance.restartCount,
    instance.configPath,
    instance.profilePath,
    instance.battleyePath,
    JSON.stringify(instance.alerts),
    instance.discordStatusMessageId,
    instance.discordBotStatusMessageId,
    instance.lastLowFpsAlertAt,
    instance.lastLowFpsRecoveryAt,
    instance.lastMemoryAlertAt,
    instance.lastStatusEmbedAt,
    instance.lastKnownPlayerCount,
    instance.lastJoinLeaveScanAt,
    instance.discordBotCrashPingAt,
    instance.discordBotEmptySince,
    instance.discordBotSeedPingAt,
    JSON.stringify(instance.rotation ?? defaultInstanceRotation()),
  ];
}

async function syncInstances(client: PoolClient, instances: InstanceRecord[]) {
  const ids = instances.map((item) => item.id);
  for (const instance of instances) {
    await client.query(INSTANCE_UPSERT, instanceParams(instance));
  }
  if (ids.length) {
    await client.query("DELETE FROM instances WHERE NOT (id = ANY($1::text[]))", [ids]);
  } else {
    await client.query("DELETE FROM instances");
  }
}

async function syncMissions(client: PoolClient, missions: MissionMeta[]) {
  const slugs = missions.map((item) => item.slug);
  for (const mission of missions) {
    await client.query(
      `INSERT INTO missions (slug, title, scenario_id, source, required_mod_ids, required_mods, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (slug) DO UPDATE SET
         title = EXCLUDED.title, scenario_id = EXCLUDED.scenario_id, source = EXCLUDED.source,
         required_mod_ids = EXCLUDED.required_mod_ids, required_mods = EXCLUDED.required_mods,
         created_at = EXCLUDED.created_at`,
      [
        mission.slug,
        mission.title,
        mission.scenarioId,
        mission.source,
        JSON.stringify(mission.requiredModIds),
        JSON.stringify(mission.requiredMods),
        mission.createdAt,
      ],
    );
  }
  if (slugs.length) {
    await client.query("DELETE FROM missions WHERE NOT (slug = ANY($1::text[]))", [slugs]);
  } else {
    await client.query("DELETE FROM missions");
  }
}

export async function loadPostgresStore(): Promise<PanelStore> {
  const [instancesRes, missionsRes, settingsRes, runtimeRes, auditRes] = await Promise.all([
    getPool().query("SELECT * FROM instances ORDER BY created_at ASC"),
    getPool().query("SELECT * FROM missions ORDER BY created_at DESC"),
    getPool().query("SELECT data FROM panel_settings WHERE id = 1"),
    getPool().query("SELECT data FROM bot_runtime WHERE id = 1"),
    getPool().query("SELECT id, at, action, detail FROM audit ORDER BY id DESC LIMIT 500"),
  ]);

  const audit = auditRes.rows.map((row) => ({
    id: Number(row.id),
    at: new Date(String(row.at)).toISOString(),
    action: String(row.action),
    detail: String(row.detail),
  }));
  const nextAuditId = audit.reduce((max, row) => Math.max(max, row.id + 1), 1);

  return hydrateStoreSecrets(
    normalizeStore({
      instances: instancesRes.rows.map((row) => rowToInstance(row)),
      missions: missionsRes.rows.map((row) => ({
        slug: String(row.slug),
        title: String(row.title),
        scenarioId: String(row.scenario_id),
        source: row.source as MissionMeta["source"],
        requiredModIds: row.required_mod_ids,
        requiredMods: row.required_mods,
        createdAt: new Date(String(row.created_at)).toISOString(),
      })),
      settings: settingsRes.rows[0]?.data ?? defaultSettings(),
      botRuntime: runtimeRes.rows[0]?.data ?? defaultBotRuntime(),
      audit,
      nextAuditId,
    }),
  );
}

export async function syncPostgresStore(data: PanelStore) {
  const sealed = sealStoreSecrets(data);
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await syncInstances(client, sealed.instances);
    await syncMissions(client, sealed.missions);
    await client.query(
      `INSERT INTO panel_settings (id, data) VALUES (1, $1::jsonb)
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`,
      [JSON.stringify(sealed.settings)],
    );
    await client.query(
      `INSERT INTO bot_runtime (id, data) VALUES (1, $1::jsonb)
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`,
      [JSON.stringify(sealed.botRuntime)],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function insertPostgresAudit(entry: AuditEntry) {
  await getPool().query("INSERT INTO audit (id, at, action, detail) VALUES ($1, $2, $3, $4)", [
    entry.id,
    entry.at,
    entry.action,
    entry.detail,
  ]);
  await getPool().query(
    "SELECT setval(pg_get_serial_sequence('audit', 'id'), (SELECT COALESCE(MAX(id), 1) FROM audit))",
  );
}

export async function importStoreToPostgres(data: PanelStore) {
  await ensureSchema();
  const sealed = sealStoreSecrets(data);
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await syncInstances(client, sealed.instances);
    await syncMissions(client, sealed.missions);
    await client.query(
      `INSERT INTO panel_settings (id, data) VALUES (1, $1::jsonb)
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`,
      [JSON.stringify(sealed.settings)],
    );
    await client.query(
      `INSERT INTO bot_runtime (id, data) VALUES (1, $1::jsonb)
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`,
      [JSON.stringify(sealed.botRuntime)],
    );
    await client.query("DELETE FROM audit");
    for (const entry of [...data.audit].sort((a, b) => a.id - b.id)) {
      await client.query("INSERT INTO audit (id, at, action, detail) VALUES ($1, $2, $3, $4)", [
        entry.id,
        entry.at,
        entry.action,
        entry.detail,
      ]);
    }
    await client.query(
      "SELECT setval(pg_get_serial_sequence('audit', 'id'), (SELECT COALESCE(MAX(id), 1) FROM audit))",
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function postgresIsEmpty() {
  const res = await getPool().query(
    "SELECT (SELECT COUNT(*)::int FROM instances) AS instances, (SELECT COUNT(*)::int FROM panel_settings) AS settings",
  );
  const row = res.rows[0];
  return Number(row.instances) === 0 && Number(row.settings) === 0;
}

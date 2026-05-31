import fs from "fs";
import path from "path";
import type { InstanceRecord, MissionMeta } from "../../lib/shared/types";
import { mergeInstanceAlerts } from "../../lib/shared/alerts";
import { agentConfig } from "../config";
import {
  defaultBotRuntime,
  defaultSettings,
  defaultStore,
  normalizeInstance,
  normalizeStore,
  type PanelStore,
} from "./shared";
import { hydrateStoreSecrets, sealStoreSecrets } from "./secret-storage";

const storePath = path.join(agentConfig.dataDir, "panel.json");
const legacyDbPath = path.join(agentConfig.dataDir, "panel.db");
const migratedFlagPath = path.join(agentConfig.dataDir, ".sqlite-imported");

function mapLegacyInstance(row: Record<string, unknown>): InstanceRecord {
  return normalizeInstance({
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    branch: row.branch as InstanceRecord["branch"],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    autoRestart: Boolean(row.auto_restart),
    maxFps: Number(row.max_fps),
    logStatsMs: row.log_stats_ms == null ? null : Number(row.log_stats_ms),
    logLevel: row.log_level == null ? null : String(row.log_level),
    addonTempDir: String(row.addon_temp_dir),
    status: row.status as InstanceRecord["status"],
    lastStartedAt: row.last_started_at == null ? null : String(row.last_started_at),
    restartCount: Number(row.restart_count),
    configPath: String(row.config_path),
    profilePath: String(row.profile_path),
    battleyePath: String(row.battleye_path),
    alerts: mergeInstanceAlerts(),
    discordStatusMessageId: null,
    discordBotStatusMessageId: null,
    lastLowFpsAlertAt: null,
    lastLowFpsRecoveryAt: null,
    lastMemoryAlertAt: null,
    lastStatusEmbedAt: null,
    lastKnownPlayerCount: null,
    lastJoinLeaveScanAt: null,
    discordBotCrashPingAt: null,
    discordBotEmptySince: null,
    discordBotSeedPingAt: null,
  });
}

function legacyDbCandidates() {
  return [...new Set([legacyDbPath, path.join(process.cwd(), "data", "panel.db")])];
}

function importLegacySqlite() {
  if (fs.existsSync(migratedFlagPath)) return;
  const existing = fs.existsSync(storePath) ? (JSON.parse(fs.readFileSync(storePath, "utf8")) as PanelStore) : null;
  if (existing?.instances.length) return;

  const legacyDb = legacyDbCandidates().find((candidate) => fs.existsSync(candidate));
  if (!legacyDb) return;

  try {
    const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");
    const db = new DatabaseSync(legacyDb);
    const instances = (db.prepare("SELECT * FROM instances ORDER BY created_at ASC").all() as Record<string, unknown>[]).map(
      mapLegacyInstance,
    );
    const missions = (db.prepare("SELECT * FROM missions ORDER BY created_at DESC").all() as Record<string, unknown>[]).map(
      (row) => ({
        slug: String(row.slug),
        title: String(row.title),
        scenarioId: String(row.scenario_id),
        source: row.source as MissionMeta["source"],
        requiredModIds: JSON.parse(String(row.required_mod_ids)),
        requiredMods: JSON.parse(String(row.required_mods)),
        createdAt: String(row.created_at),
      }),
    );
    const settingsRow = db.prepare("SELECT value FROM settings WHERE key = 'panel'").get() as { value: string } | undefined;
    const settings = settingsRow ? JSON.parse(settingsRow.value) : defaultSettings();
    const auditRows = db.prepare("SELECT id, at, action, detail FROM audit ORDER BY id ASC").all() as Record<string, unknown>[];
    const audit = auditRows.map((row) => ({
      id: Number(row.id),
      at: String(row.at),
      action: String(row.action),
      detail: String(row.detail),
    }));
    const nextAuditId = audit.reduce((max, row) => Math.max(max, row.id + 1), 1);
    writeJsonStore({ instances, missions, settings, botRuntime: defaultBotRuntime(), audit, nextAuditId });
    fs.writeFileSync(migratedFlagPath, new Date().toISOString());
  } catch {
    /* node:sqlite unavailable or legacy db unreadable */
  }
}

export function writeJsonStore(data: PanelStore) {
  fs.mkdirSync(agentConfig.dataDir, { recursive: true });
  const tmp = `${storePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(sealStoreSecrets(data), null, 2));
  fs.renameSync(tmp, storePath);
}

export function loadJsonStore(): PanelStore {
  importLegacySqlite();
  if (fs.existsSync(storePath)) {
    const raw = JSON.parse(fs.readFileSync(storePath, "utf8")) as PanelStore;
    const data = hydrateStoreSecrets(normalizeStore(raw));
    const needsMigration = raw.instances?.some((inst) => !inst.alerts);
    if (needsMigration) writeJsonStore(data);
    return data;
  }
  const data = defaultStore();
  writeJsonStore(data);
  return data;
}

export function jsonStorePath() {
  return storePath;
}

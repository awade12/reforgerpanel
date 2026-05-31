import fs from "fs";
import path from "path";
import { agentConfig } from "../config";
import type { AuditEntry, BotRuntimeRecord, InstanceRecord, MissionMeta, SettingsRecord } from "../../lib/shared/types";
import { normalizePanelSettings } from "../../lib/shared/alerts";
import { mergeSettingsSecrets } from "../../lib/shared/secrets";
import { jsonStorePath, loadJsonStore, writeJsonStore } from "./json-store";
import {
  ensureSchema,
  importStoreToPostgres,
  insertPostgresAudit,
  loadPostgresStore,
  postgresIsEmpty,
  syncPostgresStore,
  usePostgres,
} from "./postgres";
import { secretsEncryptionConfigured } from "../../lib/shared/secrets-crypto";
import { defaultBotRuntime, normalizeInstance, type PanelStore } from "./shared";

let store: PanelStore | null = null;
let initPromise: Promise<void> | null = null;

function persistStore(data: PanelStore) {
  if (usePostgres()) {
    void syncPostgresStore(data).catch((err) => {
      console.error("[db] postgres sync failed:", err instanceof Error ? err.message : err);
    });
    return;
  }
  writeJsonStore(data);
}

function mutate(mutator: (data: PanelStore) => void) {
  const data = getStore();
  mutator(data);
  persistStore(data);
}

async function migrateJsonToPostgresIfNeeded() {
  const jsonPath = jsonStorePath();
  if (!fs.existsSync(jsonPath)) return;
  if (!(await postgresIsEmpty())) return;

  const jsonStore = loadJsonStore();
  if (!jsonStore.instances.length && !jsonStore.settings.discordBotToken) {
    const raw = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as PanelStore;
    if (!raw.instances?.length && !raw.settings?.discordBotToken) return;
  }

  console.log("[db] Importing panel.json into PostgreSQL…");
  await importStoreToPostgres(jsonStore);
  const backup = `${jsonPath}.pre-postgres.${Date.now()}.bak`;
  fs.renameSync(jsonPath, backup);
  console.log(`[db] PostgreSQL import complete — JSON backed up to ${backup}`);
}

export async function initDb() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    if (usePostgres()) {
      await ensureSchema();
      if (!secretsEncryptionConfigured()) {
        console.warn(
          "[secrets] Set SECRETS_ENCRYPTION_KEY in env to encrypt Discord/Resend credentials at rest in PostgreSQL",
        );
      }
      await migrateJsonToPostgresIfNeeded();
      store = await loadPostgresStore();
      console.log("[db] Using PostgreSQL");
      if (secretsEncryptionConfigured()) {
        persistStore(store);
      }
      return;
    }
    fs.mkdirSync(agentConfig.dataDir, { recursive: true });
    store = loadJsonStore();
    console.log(`[db] Using JSON store at ${path.join(agentConfig.dataDir, "panel.json")}`);
    if (secretsEncryptionConfigured()) {
      persistStore(store);
    }
  })();
  return initPromise;
}

export function getStore(): PanelStore {
  if (!store) throw new Error("Database not initialized — call initDb() first");
  return store;
}

export function getDb() {
  return getStore();
}

export function listInstances(): InstanceRecord[] {
  return [...getStore().instances].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(normalizeInstance);
}

export function getInstance(id: string): InstanceRecord | null {
  const instance = getStore().instances.find((item) => item.id === id) ?? null;
  return instance ? normalizeInstance(instance) : null;
}

export function getInstanceBySlug(slug: string): InstanceRecord | null {
  const instance = getStore().instances.find((item) => item.slug === slug) ?? null;
  return instance ? normalizeInstance(instance) : null;
}

export function insertInstance(record: InstanceRecord) {
  mutate((data) => {
    data.instances.push(record);
  });
}

export function updateInstance(id: string, patch: Partial<InstanceRecord>) {
  const current = getInstance(id);
  if (!current) return null;
  const next = normalizeInstance({ ...current, ...patch, updatedAt: new Date().toISOString() });
  mutate((data) => {
    const index = data.instances.findIndex((instance) => instance.id === id);
    if (index >= 0) data.instances[index] = next;
  });
  return next;
}

export function deleteInstance(id: string) {
  mutate((data) => {
    data.instances = data.instances.filter((instance) => instance.id !== id);
  });
}

export function listMissions(): MissionMeta[] {
  return [...getStore().missions].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function upsertMission(mission: MissionMeta) {
  mutate((data) => {
    const index = data.missions.findIndex((item) => item.slug === mission.slug);
    if (index >= 0) data.missions[index] = mission;
    else data.missions.push(mission);
  });
}

export function deleteMission(slug: string) {
  mutate((data) => {
    data.missions = data.missions.filter((mission) => mission.slug !== slug);
  });
}

export function getSettings(): SettingsRecord {
  return normalizePanelSettings(getStore().settings);
}

export function saveSettings(settings: Partial<SettingsRecord>) {
  mutate((data) => {
    data.settings = normalizePanelSettings(mergeSettingsSecrets(data.settings, settings));
  });
}

export function getBotRuntime(): BotRuntimeRecord {
  return { ...defaultBotRuntime(), ...getStore().botRuntime };
}

export function recordBotHeartbeat(input: { username?: string; tag?: string; deployedAt?: string }) {
  mutate((data) => {
    data.botRuntime = {
      ...defaultBotRuntime(),
      ...data.botRuntime,
      lastSeenAt: new Date().toISOString(),
      username: input.username ?? data.botRuntime.username,
      tag: input.tag ?? data.botRuntime.tag,
      lastDeployAt: input.deployedAt ?? data.botRuntime.lastDeployAt,
    };
  });
}

export function updateBotRuntime(patch: Partial<BotRuntimeRecord>) {
  mutate((data) => {
    data.botRuntime = { ...defaultBotRuntime(), ...data.botRuntime, ...patch };
  });
}

export function clearBotDashboardRecovery(instanceId: string) {
  const instance = getInstance(instanceId);
  if (!instance) return;
  if (
    instance.discordBotCrashPingAt ||
    instance.discordBotEmptySince ||
    instance.discordBotSeedPingAt
  ) {
    updateInstance(instanceId, {
      discordBotCrashPingAt: null,
      discordBotEmptySince: null,
      discordBotSeedPingAt: null,
    });
  }
}

export function addAudit(action: string, detail: string) {
  const entry: AuditEntry = {
    id: getStore().nextAuditId++,
    at: new Date().toISOString(),
    action,
    detail,
  };
  mutate((data) => {
    data.audit.unshift(entry);
  });
  if (usePostgres()) {
    void insertPostgresAudit(entry).catch((err) => {
      console.error("[db] audit insert failed:", err instanceof Error ? err.message : err);
    });
  }
}

export function listAudit(limit = 100): AuditEntry[] {
  return getStore().audit.slice(0, limit);
}

export function getUsedPorts(): number[] {
  const instances = listInstances();
  const ports: number[] = [];
  for (const instance of instances) {
    try {
      const raw = fs.readFileSync(instance.configPath, "utf8");
      const config = JSON.parse(raw) as { publicPort?: number; bindPort?: number };
      ports.push(config.publicPort || config.bindPort || 0);
    } catch {
      /* ignore */
    }
  }
  return ports.filter(Boolean);
}

export function nextFreePort(start = 2001): number {
  const used = new Set(getUsedPorts());
  let port = start;
  while (used.has(port)) port += 1;
  return port;
}

export function instanceDir(id: string) {
  return path.join(agentConfig.instancesDir, id);
}

export { usePostgres } from "./postgres";

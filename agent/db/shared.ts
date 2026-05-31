import type { AuditEntry, BotRuntimeRecord, InstanceRecord, MissionMeta, SettingsRecord } from "../../lib/shared/types";
import { mergeInstanceAlerts, mergeSettings, normalizePanelSettings } from "../../lib/shared/alerts";

export interface PanelStore {
  instances: InstanceRecord[];
  missions: MissionMeta[];
  settings: SettingsRecord;
  botRuntime: BotRuntimeRecord;
  audit: AuditEntry[];
  nextAuditId: number;
}

export function defaultSettings(): SettingsRecord {
  return mergeSettings<SettingsRecord>();
}

export function defaultBotRuntime(): BotRuntimeRecord {
  return {
    lastSeenAt: null,
    lastDeployAt: null,
    username: null,
    tag: null,
    discordBotMaintenanceMessageId: null,
  };
}

export function defaultStore(): PanelStore {
  return {
    instances: [],
    missions: [],
    settings: defaultSettings(),
    botRuntime: defaultBotRuntime(),
    audit: [],
    nextAuditId: 1,
  };
}

export function normalizeInstance(instance: InstanceRecord): InstanceRecord {
  return {
    ...instance,
    alerts: mergeInstanceAlerts(instance.alerts),
    discordStatusMessageId: instance.discordStatusMessageId ?? null,
    discordBotStatusMessageId: instance.discordBotStatusMessageId ?? null,
    lastLowFpsAlertAt: instance.lastLowFpsAlertAt ?? null,
    lastLowFpsRecoveryAt: instance.lastLowFpsRecoveryAt ?? null,
    lastMemoryAlertAt: instance.lastMemoryAlertAt ?? null,
    lastStatusEmbedAt: instance.lastStatusEmbedAt ?? null,
    lastKnownPlayerCount: instance.lastKnownPlayerCount ?? null,
    lastJoinLeaveScanAt: instance.lastJoinLeaveScanAt ?? null,
    discordBotCrashPingAt: instance.discordBotCrashPingAt ?? null,
    discordBotEmptySince: instance.discordBotEmptySince ?? null,
    discordBotSeedPingAt: instance.discordBotSeedPingAt ?? null,
  };
}

export function normalizeStore(raw: Partial<PanelStore>): PanelStore {
  return {
    ...defaultStore(),
    ...raw,
    instances: (raw.instances ?? []).map(normalizeInstance),
    missions: raw.missions ?? [],
    settings: normalizePanelSettings(raw.settings),
    botRuntime: { ...defaultBotRuntime(), ...raw.botRuntime },
    audit: raw.audit ?? [],
    nextAuditId: raw.nextAuditId ?? 1,
  };
}

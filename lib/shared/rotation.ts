import type { InstanceRotationConfig } from "./types";

export function defaultInstanceRotation(): InstanceRotationConfig {
  return {
    enabled: false,
    missionSlugs: [],
    nextIndex: 0,
    cron: "0 5 * * 0",
    onlyIfEmpty: true,
    replaceMods: true,
    downloadMods: true,
    enableMaintenanceBanner: true,
    autoBackup: true,
    maintenanceMessage: "",
    lastRotatedAt: null,
    lastMissionSlug: null,
    lastRunKey: null,
  };
}

export function normalizeInstanceRotation(partial?: Partial<InstanceRotationConfig>): InstanceRotationConfig {
  const base = defaultInstanceRotation();
  const merged = { ...base, ...partial };
  return {
    ...merged,
    enabled: Boolean(merged.enabled),
    missionSlugs: Array.isArray(merged.missionSlugs)
      ? merged.missionSlugs.map((slug) => String(slug).trim()).filter(Boolean)
      : [],
    nextIndex: Math.max(0, Number(merged.nextIndex) || 0),
    cron: merged.cron?.trim() || "0 5 * * 0",
    onlyIfEmpty: merged.onlyIfEmpty !== false,
    replaceMods: merged.replaceMods !== false,
    downloadMods: merged.downloadMods !== false,
    enableMaintenanceBanner: merged.enableMaintenanceBanner !== false,
    autoBackup: merged.autoBackup !== false,
    maintenanceMessage: merged.maintenanceMessage ?? "",
    lastRotatedAt: merged.lastRotatedAt ?? null,
    lastMissionSlug: merged.lastMissionSlug ?? null,
    lastRunKey: merged.lastRunKey ?? null,
  };
}

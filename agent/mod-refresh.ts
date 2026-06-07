import type { ModEntry } from "../lib/shared/config-schema";
import {
  modsWithoutPinnedVersions,
  refreshConfiguredMods,
  type ModCachePaths,
  type ModRefreshResult,
} from "../lib/shared/mod-cache";
import type { InstanceRecord } from "../lib/shared/types";
import { readInstanceConfig, startInstanceById, stopInstanceById, writeInstanceConfig } from "./instances";
import { getReconciledInstance } from "./instance-state";

function instanceModPaths(instance: InstanceRecord): ModCachePaths {
  return { profilePath: instance.profilePath, addonTempDir: instance.addonTempDir };
}

function configuredMods(instance: InstanceRecord) {
  return (readInstanceConfig(instance).game.mods ?? []).filter((mod) => mod.modId?.trim());
}

function clearPinnedModVersions(instance: InstanceRecord, mods: ModEntry[], onLine?: (line: string) => void) {
  const hadVersions = mods.some((mod) => mod.version?.trim());
  if (!hadVersions) return mods;
  const config = readInstanceConfig(instance);
  const cleared = modsWithoutPinnedVersions(mods);
  writeInstanceConfig(instance, { ...config, game: { ...config.game, mods: cleared } });
  onLine?.("Cleared pinned mod versions from config");
  return cleared;
}

export function refreshInstanceModCache(instance: InstanceRecord, onLine?: (line: string) => void) {
  const mods = configuredMods(instance);
  const cleared = clearPinnedModVersions(instance, mods, onLine);
  return refreshConfiguredMods(instanceModPaths(instance), cleared, onLine);
}

export async function refreshInstanceWorkshopMods(
  instanceId: string,
  options?: { onLine?: (line: string) => void },
): Promise<{ results: ModRefreshResult[]; stopped: boolean; started: boolean }> {
  const instance = getReconciledInstance(instanceId);
  const wasRunning = instance.status === "running" || instance.status === "starting";

  if (wasRunning) {
    await stopInstanceById(instanceId);
    options?.onLine?.(`Stopped ${instance.slug} before mod refresh`);
  }

  const { results } = refreshInstanceModCache(instance, options?.onLine);

  let started = false;
  if (wasRunning) {
    await startInstanceById(instanceId);
    started = true;
    options?.onLine?.(`Started ${instance.slug} — downloading latest workshop mods`);
  }

  return { results, stopped: wasRunning, started };
}

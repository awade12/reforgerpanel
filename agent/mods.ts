import type { ModEntry } from "../lib/shared/config-schema";
import {
  findModPath,
  modCacheEntryPath,
  purgeModCache,
  refreshConfiguredMods,
  type ModRefreshResult,
} from "../lib/shared/mod-cache";
import type { InstanceRecord } from "../lib/shared/types";
import { readInstanceConfig } from "./instances";

export type ModCheckResult = {
  modId: string;
  name?: string;
  workshopId?: string;
  ok: boolean;
  detail: string;
};

export type { ModRefreshResult };

export { modCacheEntryPath, purgeModCache, refreshConfiguredMods };

function findModOnDisk(profilePath: string, modId: string) {
  return findModPath(profilePath, modId);
}

export function checkConfiguredMods(instance: InstanceRecord, mods?: ModEntry[]): ModCheckResult[] {
  let configured = mods;
  if (!configured) {
    try {
      configured = readInstanceConfig(instance).game.mods ?? [];
    } catch {
      configured = [];
    }
  }

  return configured.map((mod) => {
    if (!mod.modId?.trim()) {
      return { modId: mod.modId, name: mod.name, workshopId: mod.workshopId, ok: false, detail: "Empty mod ID" };
    }
    const found = findModOnDisk(instance.profilePath, mod.modId);
    if (found) {
      return { modId: mod.modId, name: mod.name, workshopId: mod.workshopId, ok: true, detail: found };
    }
    if (mod.workshopId) {
      return {
        modId: mod.modId,
        name: mod.name,
        workshopId: mod.workshopId,
        ok: false,
        detail: "Not found on disk — use Refresh workshop mods, then start",
      };
    }
    return {
      modId: mod.modId,
      name: mod.name,
      workshopId: mod.workshopId,
      ok: false,
      detail: "Not found locally — start the instance to download from the workshop",
    };
  });
}

export function missingRequiredMods(instance: InstanceRecord) {
  return checkConfiguredMods(instance).filter((mod) => !mod.ok);
}

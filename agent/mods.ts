import fs from "fs";
import path from "path";
import type { ModEntry } from "../lib/shared/config-schema";
import type { InstanceRecord } from "../lib/shared/types";
import { readInstanceConfig } from "./instances";

export type ModCheckResult = {
  modId: string;
  name?: string;
  workshopId?: string;
  ok: boolean;
  detail: string;
};

function normalizeModId(modId: string) {
  return modId.trim().toLowerCase();
}

function findModOnDisk(profilePath: string, modId: string) {
  const needle = normalizeModId(modId);
  const roots = [
    path.join(profilePath, "addons"),
    path.join(profilePath, "logs"),
    profilePath,
  ];

  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    const stack = [root];
    while (stack.length) {
      const current = stack.pop()!;
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(current, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) {
          if (entry.name.toLowerCase().includes(needle.replace(/[{}]/g, ""))) return full;
          stack.push(full);
          continue;
        }
        if (entry.name.toLowerCase().includes(needle.replace(/[{}]/g, ""))) return full;
      }
    }
  }
  return null;
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
        detail: "Not found on disk — use Download mods",
      };
    }
    return {
      modId: mod.modId,
      name: mod.name,
      workshopId: mod.workshopId,
      ok: false,
      detail: "Not found locally — server may download on first start, or add a Steam Workshop ID",
    };
  });
}

export function missingRequiredMods(instance: InstanceRecord) {
  return checkConfiguredMods(instance).filter((mod) => !mod.ok);
}

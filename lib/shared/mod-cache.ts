import fs from "fs";
import path from "path";
import type { ModEntry } from "./config-schema";

export type ModRefreshResult = {
  modId: string;
  name?: string;
  ok: boolean;
  detail: string;
};

export function modIdNeedle(modId: string) {
  return modId.trim().toLowerCase().replace(/[{}]/g, "");
}

export function resolveModCacheRoot(profilePath: string, foundPath: string) {
  const addonsRoot = path.join(profilePath, "addons");
  if (!foundPath.startsWith(addonsRoot)) return foundPath;
  let current = foundPath;
  while (path.dirname(current) !== addonsRoot && path.dirname(current) !== current) {
    current = path.dirname(current);
  }
  return current;
}

export function findModPath(profilePath: string, modId: string) {
  const needle = modIdNeedle(modId);
  const roots = [path.join(profilePath, "addons"), path.join(profilePath, "logs"), profilePath];

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
          if (entry.name.toLowerCase().includes(needle)) return full;
          stack.push(full);
          continue;
        }
        if (entry.name.toLowerCase().includes(needle)) return full;
      }
    }
  }
  return null;
}

export function modCacheEntryPath(profilePath: string, modId: string) {
  const found = findModPath(profilePath, modId);
  return found ? resolveModCacheRoot(profilePath, found) : null;
}

export function purgeModCache(profilePath: string, modId: string) {
  const target = modCacheEntryPath(profilePath, modId);
  if (!target) return false;
  fs.rmSync(target, { recursive: true, force: true });
  return true;
}

export function refreshConfiguredMods(
  profilePath: string,
  mods: ModEntry[],
  onLine?: (line: string) => void,
): { results: ModRefreshResult[] } {
  const results: ModRefreshResult[] = [];
  for (const mod of mods) {
    if (!mod.modId?.trim()) continue;
    const label = mod.name?.trim() || mod.modId;
    try {
      const purged = purgeModCache(profilePath, mod.modId);
      const detail = purged ? "Cache cleared — will re-download on next start" : "Not cached locally";
      results.push({ modId: mod.modId, name: mod.name, ok: true, detail });
      onLine?.(`${label}: ${detail}`);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      results.push({ modId: mod.modId, name: mod.name, ok: false, detail });
      onLine?.(`${label}: failed — ${detail}`);
    }
  }
  return { results };
}

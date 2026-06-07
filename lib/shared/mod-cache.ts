import fs from "fs";
import path from "path";
import type { ModEntry } from "./config-schema";
import { normalizeAddonModId } from "./workshop-catalog";

export type ModRefreshResult = {
  modId: string;
  name?: string;
  ok: boolean;
  purged: boolean;
  detail: string;
};

export type ModCacheRemover = (target: string) => void;

export type ModCachePaths = {
  profilePath: string;
  addonTempDir?: string;
};

export function modIdNeedle(modId: string) {
  return modId.trim().toLowerCase().replace(/[{}]/g, "");
}

export function resolveModCacheRoot(profilePath: string, foundPath: string) {
  for (const addonsName of ["addons", "Addons"]) {
    const addonsRoot = path.join(profilePath, addonsName);
    if (!foundPath.startsWith(addonsRoot)) continue;
    let current = foundPath;
    while (path.dirname(current) !== addonsRoot && path.dirname(current) !== current) {
      current = path.dirname(current);
    }
    return current;
  }
  return foundPath;
}

export function findModPath(profilePath: string, modId: string) {
  const needle = modIdNeedle(modId);
  const roots = [path.join(profilePath, "addons"), path.join(profilePath, "Addons"), path.join(profilePath, "logs"), profilePath];

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

export function listModCacheTargets(paths: ModCachePaths, modId: string) {
  const id = normalizeAddonModId(modId);
  const targets = new Set<string>();

  for (const addonsName of ["addons", "Addons"]) {
    const root = path.join(paths.profilePath, addonsName);
    if (!fs.existsSync(root)) continue;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.replace(/[{}]/g, "").toUpperCase() === id) {
        targets.add(path.join(root, entry.name));
      }
    }
  }

  const found = findModPath(paths.profilePath, modId);
  if (found) targets.add(resolveModCacheRoot(paths.profilePath, found));

  return [...targets];
}

export function modCacheEntryPath(profilePath: string, modId: string) {
  const targets = listModCacheTargets({ profilePath }, modId);
  return targets[0] ?? null;
}

function clearDirectoryContents(dir: string, remove: ModCacheRemover) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir)) {
    remove(path.join(dir, entry));
  }
}

export function purgeInstanceModTemp(paths: ModCachePaths, remove: ModCacheRemover) {
  if (paths.addonTempDir) clearDirectoryContents(paths.addonTempDir, remove);
  clearDirectoryContents(path.join(paths.profilePath, "temp"), remove);
}

export function purgeModWorkCache(paths: ModCachePaths, modId: string, remove: ModCacheRemover) {
  const targets = listModCacheTargets(paths, modId);
  if (!targets.length) return false;
  for (const target of targets) {
    remove(target);
  }
  return true;
}

export function purgeModCache(profilePath: string, modId: string, remove?: ModCacheRemover) {
  const rm = remove ?? ((target) => fs.rmSync(target, { recursive: true, force: true }));
  return purgeModWorkCache({ profilePath }, modId, rm);
}

export function modsWithoutPinnedVersions(mods: ModEntry[]) {
  return mods.map(({ version: _version, ...rest }) => rest);
}

export function refreshConfiguredMods(
  paths: ModCachePaths,
  mods: ModEntry[],
  remove: ModCacheRemover,
  onLine?: (line: string) => void,
): { results: ModRefreshResult[] } {
  purgeInstanceModTemp(paths, remove);
  const results: ModRefreshResult[] = [];
  for (const mod of mods) {
    if (!mod.modId?.trim()) continue;
    const label = mod.name?.trim() || mod.modId;
    try {
      const purged = purgeModWorkCache(paths, mod.modId, remove);
      const detail = purged ? "Cache cleared — will re-download on next start" : "Not found on disk";
      results.push({ modId: mod.modId, name: mod.name, ok: true, purged, detail });
      onLine?.(`${label}: ${detail}`);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      results.push({ modId: mod.modId, name: mod.name, ok: false, purged: false, detail });
      onLine?.(`${label}: failed — ${detail}`);
    }
  }
  return { results };
}

import fs from "fs";
import path from "path";
import type { ModEntry } from "../lib/shared/config-schema";
import { refreshConfiguredMods, type ModRefreshResult } from "../lib/shared/mod-cache";
import { removeInstancePath } from "./instance-paths";

export function workshopDownloadDir(instanceProfilePath: string) {
  return path.join(instanceProfilePath, "addons");
}

export function refreshWorkshopMods(
  profilePath: string,
  addonTempDir: string | undefined,
  mods: ModEntry[],
  onLine?: (line: string) => void,
): { results: ModRefreshResult[]; installDir: string } {
  const installDir = workshopDownloadDir(profilePath);
  fs.mkdirSync(installDir, { recursive: true });
  return {
    ...refreshConfiguredMods({ profilePath, addonTempDir }, mods, removeInstancePath, onLine),
    installDir,
  };
}

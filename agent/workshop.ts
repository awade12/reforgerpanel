import fs from "fs";
import path from "path";
import { APP_ID_EXPERIMENTAL, APP_ID_STABLE } from "../lib/shared/constants";
import type { Branch } from "../lib/shared/types";
import { agentConfig } from "./config";
import { runSteamCmd } from "./steamcmd";

function appId(branch: Branch) {
  return branch === "stable" ? APP_ID_STABLE : APP_ID_EXPERIMENTAL;
}

export function workshopDownloadDir(instanceProfilePath: string) {
  return path.join(instanceProfilePath, "addons");
}

export async function downloadWorkshopItem(
  branch: Branch,
  workshopId: string,
  installDir: string,
  onLine?: (line: string) => void,
) {
  const id = workshopId.trim();
  if (!/^\d+$/.test(id)) {
    throw new Error("Workshop ID must be numeric");
  }
  fs.mkdirSync(installDir, { recursive: true });
  const args = [
    "+force_install_dir",
    installDir,
    "+login",
    "anonymous",
    "+workshop_download_item",
    String(appId(branch)),
    id,
    "+quit",
  ];
  const result = await runSteamCmd(args, onLine);
  return { ok: result.ok, output: result.output, workshopId: id, installDir };
}

export async function downloadWorkshopMods(
  branch: Branch,
  profilePath: string,
  items: { workshopId: string; name?: string }[],
  onLine?: (line: string) => void,
) {
  const installDir = workshopDownloadDir(profilePath);
  const results: { workshopId: string; ok: boolean; name?: string }[] = [];
  for (const item of items) {
    if (!item.workshopId?.trim()) continue;
    const result = await downloadWorkshopItem(branch, item.workshopId, installDir, onLine);
    results.push({ workshopId: item.workshopId, ok: result.ok, name: item.name });
  }
  return { results, installDir };
}

import fs from "fs";
import path from "path";
import { agentConfig } from "../config";
import { defaultStore, normalizeStore, type PanelStore } from "./shared";
import { hydrateStoreSecrets, sealStoreSecrets } from "./secret-storage";

const storePath = path.join(agentConfig.dataDir, "panel.json");

export function writeJsonStore(data: PanelStore) {
  fs.mkdirSync(agentConfig.dataDir, { recursive: true });
  const tmp = `${storePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(sealStoreSecrets(data), null, 2));
  fs.renameSync(tmp, storePath);
}

export function loadJsonStore(): PanelStore {
  if (fs.existsSync(storePath)) {
    const raw = JSON.parse(fs.readFileSync(storePath, "utf8")) as PanelStore;
    const data = hydrateStoreSecrets(normalizeStore(raw));
    const needsMigration = raw.instances?.some((inst) => !inst.alerts);
    if (needsMigration) writeJsonStore(data);
    return data;
  }
  const data = defaultStore();
  writeJsonStore(data);
  return data;
}

export function jsonStorePath() {
  return storePath;
}

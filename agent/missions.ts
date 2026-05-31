import fs from "fs";
import path from "path";
import type { ModEntry } from "../lib/shared/config-schema";
import type { MissionMeta } from "../lib/shared/types";
import { normalizeAddonModId } from "../lib/shared/workshop-catalog";
import { agentConfig } from "./config";
import { deleteMission, getInstance, listMissions, upsertMission } from "./db";
import { readInstanceConfig, writeInstanceConfig, getInstanceDetailed } from "./instances";

export function listAllMissions(): MissionMeta[] {
  return listMissions();
}

export function getMission(slug: string) {
  return listMissions().find((m) => m.slug === slug) ?? null;
}

export function registerMission(input: {
  slug: string;
  title: string;
  scenarioId: string;
  source?: MissionMeta["source"];
  requiredModIds?: string[];
  requiredMods?: ModEntry[];
}) {
  const requiredMods = (input.requiredMods ?? []).map((mod) => ({
    ...mod,
    modId: normalizeAddonModId(mod.modId),
  }));
  const mission: MissionMeta = {
    slug: input.slug,
    title: input.title,
    scenarioId: input.scenarioId,
    source: input.source ?? "Custom",
    requiredModIds: input.requiredModIds ?? requiredMods.map((m) => m.modId),
    requiredMods,
    createdAt: new Date().toISOString(),
  };
  const dir = path.join(agentConfig.missionsDir, mission.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify(mission, null, 2));
  upsertMission(mission);
  return mission;
}

export function saveMissionUpload(slug: string, title: string, scenarioId: string, requiredMods: ModEntry[], files: Record<string, string>) {
  const dir = path.join(agentConfig.missionsDir, slug);
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, contentBase64] of Object.entries(files)) {
    const target = path.join(dir, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, Buffer.from(contentBase64, "base64"));
  }
  return registerMission({
    slug,
    title,
    scenarioId,
    requiredModIds: requiredMods.map((m) => m.modId),
    requiredMods,
  });
}

export function removeMission(slug: string) {
  deleteMission(slug);
  fs.rmSync(path.join(agentConfig.missionsDir, slug), { recursive: true, force: true });
}

export function mergeMissionModsIntoInstance(instanceId: string, missionSlug: string, replace = false) {
  const mission = getMission(missionSlug);
  if (!mission) throw new Error("Mission not found");
  const instance = getInstance(instanceId);
  if (!instance) throw new Error("Instance not found");
  const config = readInstanceConfig(instance);
  config.game.scenarioId = mission.scenarioId;
  const existing = config.game.mods ?? [];
  const merged = replace ? [...mission.requiredMods] : [...existing];
  for (const mod of mission.requiredMods) {
    if (!merged.some((m) => m.modId === mod.modId)) merged.push(mod);
  }
  config.game.mods = merged;
  writeInstanceConfig(instance, config);
  return getInstanceDetailed(instanceId);
}

export function loadMissionMetaFromDisk(): MissionMeta[] {
  if (!fs.existsSync(agentConfig.missionsDir)) return [];
  const entries = fs.readdirSync(agentConfig.missionsDir, { withFileTypes: true });
  const missions: MissionMeta[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const metaPath = path.join(agentConfig.missionsDir, entry.name, "meta.json");
    if (!fs.existsSync(metaPath)) continue;
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf8")) as MissionMeta;
      upsertMission(meta);
      missions.push(meta);
    } catch {
      /* ignore */
    }
  }
  return missions;
}

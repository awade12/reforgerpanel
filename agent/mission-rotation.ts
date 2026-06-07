import { HttpError } from "../lib/shared/http-error";
import { cronRunKey, describeNextCronRun, matchesSimpleCron } from "../lib/shared/game-update";
import { normalizeInstanceRotation } from "../lib/shared/rotation";
import type { InstanceRotationConfig, InstanceRotationStatus } from "../lib/shared/types";
import { addAudit, getInstance, getSettings, listInstances, saveSettings, updateInstance } from "./db";
import { createInstanceBackup } from "./backup";
import { queryInstanceA2s } from "./a2s";
import { notifyDiscordPlain } from "./discord";
import {
  getInstanceDetailed,
  readInstanceConfig,
  startInstanceById,
  stopInstanceById,
} from "./instances";
import { isMaintenanceRunning } from "./maintenance";
import { isGameUpdateRunning } from "./monitor";
import { getMission, listAllMissions, mergeMissionModsIntoInstance } from "./missions";
import { reconcileInstanceStatus } from "./instance-state";
import { refreshWorkshopMods } from "./workshop";

const rotationOps = new Set<string>();

function missionTitle(slug: string | null) {
  if (!slug) return null;
  return getMission(slug)?.title ?? slug;
}

function findMissionSlugForScenario(scenarioId: string) {
  const match = listAllMissions().find((mission) => mission.scenarioId === scenarioId);
  return match?.slug ?? null;
}

function nextMissionSlug(rotation: InstanceRotationConfig) {
  if (!rotation.missionSlugs.length) return null;
  const index = rotation.nextIndex % rotation.missionSlugs.length;
  return rotation.missionSlugs[index] ?? null;
}

export function buildRotationStatus(instanceId: string): InstanceRotationStatus {
  const instance = getInstance(instanceId);
  if (!instance) throw new HttpError(404, "Instance not found");

  const rotation = normalizeInstanceRotation(instance.rotation);
  let currentMissionSlug = rotation.lastMissionSlug;
  if (!currentMissionSlug) {
    try {
      const config = readInstanceConfig(instance);
      currentMissionSlug = findMissionSlugForScenario(config.game.scenarioId);
    } catch {
      currentMissionSlug = null;
    }
  }

  const nextSlug = rotation.enabled ? nextMissionSlug(rotation) : null;
  return {
    rotation,
    currentMissionSlug,
    currentMissionTitle: missionTitle(currentMissionSlug),
    nextMissionSlug: nextSlug,
    nextMissionTitle: missionTitle(nextSlug),
    nextScheduledAt: rotation.enabled ? describeNextCronRun(rotation.cron) : null,
  };
}

export function updateInstanceRotation(instanceId: string, patch: Partial<InstanceRotationConfig>) {
  const instance = getInstance(instanceId);
  if (!instance) throw new HttpError(404, "Instance not found");

  const rotation = normalizeInstanceRotation({ ...instance.rotation, ...patch });
  for (const slug of rotation.missionSlugs) {
    if (!getMission(slug)) {
      throw new HttpError(400, `Mission not found: ${slug}`);
    }
  }
  if (rotation.enabled && rotation.missionSlugs.length < 2) {
    throw new HttpError(400, "Add at least two missions to enable rotation");
  }
  if (rotation.nextIndex >= rotation.missionSlugs.length) {
    rotation.nextIndex = 0;
  }

  updateInstance(instanceId, { rotation });
  addAudit("instance.rotation.update", `${instance.slug} · ${rotation.enabled ? "enabled" : "disabled"}`);
  return buildRotationStatus(instanceId);
}

async function playerCount(instanceId: string) {
  const instance = getInstance(instanceId);
  if (!instance) return 0;
  const live = reconcileInstanceStatus(instance);
  if (live.status !== "running") return 0;
  if (live.lastKnownPlayerCount != null) return live.lastKnownPlayerCount;
  try {
    const a2s = await queryInstanceA2s(live);
    const parsed = Number.parseInt(String(a2s.playerCount).split("/")[0] ?? "0", 10);
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
}

function rotationMaintenanceMessage(rotation: InstanceRotationConfig, missionTitle: string) {
  const custom = rotation.maintenanceMessage.trim();
  if (custom) return custom.replace("{mission}", missionTitle);
  return `Mission rotation — switching to ${missionTitle}. The server will restart shortly.`;
}

export async function runMissionRotation(
  instanceId: string,
  options: { trigger: "scheduled" | "manual"; force?: boolean },
) {
  if (rotationOps.has(instanceId)) {
    throw new HttpError(409, "Mission rotation already running for this instance");
  }
  if (isGameUpdateRunning()) {
    throw new HttpError(409, "Game update is running — wait for it to finish");
  }
  if (isMaintenanceRunning()) {
    throw new HttpError(409, "Maintenance restart is running — wait for it to finish");
  }

  const instance = getInstance(instanceId);
  if (!instance) throw new HttpError(404, "Instance not found");

  const rotation = normalizeInstanceRotation(instance.rotation);
  if (!rotation.enabled || rotation.missionSlugs.length < 2) {
    throw new HttpError(409, "Mission rotation is not configured");
  }

  const missionSlug = nextMissionSlug(rotation);
  if (!missionSlug) throw new HttpError(409, "No mission queued for rotation");

  const mission = getMission(missionSlug);
  if (!mission) throw new HttpError(400, `Mission not found: ${missionSlug}`);

  rotationOps.add(instanceId);
  const settings = getSettings();
  const webhook = settings.discordWebhookUrl;
  const previousMaintenanceEnabled = settings.discordBotMaintenanceEnabled;
  const previousMaintenanceMessage = settings.discordBotMaintenanceMessage;
  const live = reconcileInstanceStatus(instance);
  const wasRunning = live.status === "running" || live.status === "starting";

  try {
    if (rotation.onlyIfEmpty && !options.force) {
      const players = await playerCount(instanceId);
      if (players > 0) {
        throw new HttpError(409, `Server has ${players} player(s) online — rotation skipped`);
      }
    }

    await notifyDiscordPlain(
      options.trigger === "scheduled" ? "Scheduled mission rotation" : "Mission rotation",
      `${instance.name} → ${mission.title}`,
      webhook,
    );

    if (rotation.enableMaintenanceBanner) {
      saveSettings({
        discordBotMaintenanceEnabled: true,
        discordBotMaintenanceMessage: rotationMaintenanceMessage(rotation, mission.title),
      });
    }

    if (rotation.autoBackup) {
      createInstanceBackup(instanceId, { label: `pre-rotation-${mission.slug}` });
    }

    if (wasRunning) {
      await stopInstanceById(instanceId);
    }

    mergeMissionModsIntoInstance(instanceId, missionSlug, rotation.replaceMods);

    if (rotation.downloadMods) {
      const detailed = getInstanceDetailed(instanceId);
      if (detailed) {
        const mods = (detailed.config.game.mods ?? []).filter((mod) => mod.modId?.trim());
        if (mods.length) {
          refreshWorkshopMods(detailed.profilePath, mods);
        }
      }
    }

    const nextIndex = (rotation.nextIndex + 1) % rotation.missionSlugs.length;
    const runKey = options.trigger === "scheduled" ? cronRunKey(rotation.cron) : rotation.lastRunKey;
    updateInstance(instanceId, {
      rotation: {
        ...rotation,
        nextIndex,
        lastMissionSlug: missionSlug,
        lastRotatedAt: new Date().toISOString(),
        lastRunKey: options.trigger === "scheduled" ? runKey : rotation.lastRunKey,
      },
    });

    if (wasRunning) {
      await startInstanceById(instanceId);
    }

    addAudit("instance.rotation", `${instance.slug} → ${mission.slug} (${options.trigger})`);
    await notifyDiscordPlain(
      "Mission rotation complete",
      `${instance.name} is now running **${mission.title}**`,
      webhook,
    );

    return buildRotationStatus(instanceId);
  } finally {
    if (rotation.enableMaintenanceBanner) {
      saveSettings({
        discordBotMaintenanceEnabled: previousMaintenanceEnabled,
        discordBotMaintenanceMessage: previousMaintenanceMessage,
      });
    }
    rotationOps.delete(instanceId);
  }
}

export function startMissionRotationJob(instanceId: string) {
  void runMissionRotation(instanceId, { trigger: "manual", force: true });
  return buildRotationStatus(instanceId);
}

export function startMissionRotationLoop() {
  setInterval(() => {
    if (isGameUpdateRunning() || isMaintenanceRunning()) return;
    for (const raw of listInstances()) {
      const instance = reconcileInstanceStatus(raw);
      const rotation = normalizeInstanceRotation(instance.rotation);
      if (!rotation.enabled || rotation.missionSlugs.length < 2) continue;
      if (rotationOps.has(instance.id)) continue;

      const cron = rotation.cron || "0 5 * * 0";
      const key = cronRunKey(cron);
      if (!matchesSimpleCron(cron) || rotation.lastRunKey === key) continue;

      void runMissionRotation(instance.id, { trigger: "scheduled" }).catch((err) => {
        console.error("[rotation]", instance.slug, err instanceof Error ? err.message : err);
      });
    }
  }, 60_000);
}

import { HttpError } from "../lib/shared/http-error";
import { mergeInstanceAlerts } from "../lib/shared/alerts";
import { buildDiscordStatusEmbed, panelSupportsStatusImage, statusImageUrl } from "../lib/shared/discord-status";
import { PANEL_PUBLIC_URL } from "../lib/shared/constants";
import type { InstanceAlertEvent, InstanceRecord } from "../lib/shared/types";
import { queryInstanceA2s } from "./a2s";
import { getInstance, getSettings, updateInstance } from "./db";
import { getRuntimeMeta, readInstanceConfig } from "./instances";
import { parseFpsFromLogs } from "./logs";
import {
  deleteWebhookMessage,
  notifyDiscordLegacy,
  patchWebhookMessage,
  postWebhookMessage,
  resolveStatusWebhookUrl,
} from "./discord";

const STATUS_EMBED_MIN_MS = 60_000;
const LOW_FPS_ALERT_MIN_MS = 15 * 60_000;
const MEMORY_ALERT_MIN_MS = 15 * 60_000;

const EVENT_ENABLED_KEY: Partial<Record<InstanceAlertEvent, keyof InstanceRecord["alerts"]>> = {
  started: "alertOnStart",
  stopped: "alertOnStop",
  restarted: "alertOnRestart",
  crashed: "alertOnCrash",
  "auto-restart": "alertOnAutoRestart",
  "crash-loop": "alertOnCrashLoop",
  "low-fps": "alertOnLowFps",
  "fps-recovery": "alertOnFpsRecovery",
  "start-warning": "alertOnStartWarning",
  "player-join": "alertOnPlayerJoin",
  "player-leave": "alertOnPlayerLeave",
  "high-memory": "alertOnHighMemory",
  test: "alertOnStart",
};

export function resolveWebhookUrl(instance: InstanceRecord): string {
  const override = instance.alerts?.discordWebhookUrl?.trim();
  if (override) return override;
  return getSettings().discordWebhookUrl.trim();
}

export async function buildStatusEmbed(instance: InstanceRecord) {
  let config;
  try {
    config = readInstanceConfig(instance);
  } catch {
    config = null;
  }
  const runtime = getRuntimeMeta(instance);
  const fps = parseFpsFromLogs(instance.profilePath);
  let a2s = null;
  if (instance.status === "running") {
    try {
      a2s = await queryInstanceA2s(instance);
    } catch {
      a2s = null;
    }
  }
  const imageUrl =
    PANEL_PUBLIC_URL && panelSupportsStatusImage(PANEL_PUBLIC_URL)
      ? statusImageUrl(PANEL_PUBLIC_URL, instance.id)
      : undefined;

  return buildDiscordStatusEmbed({
    instance,
    config,
    runtime,
    fps,
    playerCount: a2s?.playerCount ?? null,
    listed: a2s?.listed ?? null,
    imageUrl,
  });
}

function shouldSendEvent(instance: InstanceRecord, event: InstanceAlertEvent) {
  if (event === "test" || event === "game-update") return true;
  const key = EVENT_ENABLED_KEY[event];
  if (!key) return true;
  return Boolean(instance.alerts?.[key]);
}

export async function sendInstanceAlert(
  instanceId: string,
  event: InstanceAlertEvent,
  message: string,
  extra?: Record<string, unknown>,
) {
  const instance = getInstance(instanceId);
  if (!instance) return;
  const webhookUrl = resolveWebhookUrl(instance);
  if (!webhookUrl) return;
  if (!shouldSendEvent(instance, event)) return;

  const result = await notifyDiscordLegacy(event, instance, message, webhookUrl, extra);
  if (!result.ok) {
    console.error(`[alerts] ${instance.slug} ${event}: ${result.error}`);
  }
}

export async function sendTestAlert(instanceId: string) {
  const instance = getInstance(instanceId);
  if (!instance) throw new HttpError(404, "Instance not found");

  const webhookUrl = resolveWebhookUrl(instance);
  if (!webhookUrl) {
    throw new HttpError(
      400,
      "No Discord webhook configured. Add one under Settings → Alerts, or set a per-instance override on this page.",
    );
  }

  const result = await notifyDiscordLegacy(
    "test",
    instance,
    "Test alert from Reforger Panel — webhook is working.",
    webhookUrl,
  );
  if (!result.ok) {
    throw new HttpError(502, result.error);
  }
}

export async function syncInstanceStatusEmbed(instanceId: string, force = false) {
  const instance = getInstance(instanceId);
  if (!instance) return;
  if (!instance.alerts?.statusEmbedEnabled && !force) return;

  const webhookUrl = resolveStatusWebhookUrl(instance);
  if (!webhookUrl) return;

  try {
    const now = Date.now();
    if (!force && instance.lastStatusEmbedAt) {
      const elapsed = now - new Date(instance.lastStatusEmbedAt).getTime();
      if (elapsed < STATUS_EMBED_MIN_MS) return;
    }

    const embed = await buildStatusEmbed(instance);
    const body = { embeds: [embed] };

    if (instance.discordStatusMessageId) {
      const result = await patchWebhookMessage(webhookUrl, instance.discordStatusMessageId, body);
      if (result.ok) {
        updateInstance(instanceId, { lastStatusEmbedAt: new Date().toISOString() });
        return;
      }
    }

    const posted = await postWebhookMessage(webhookUrl, body, true);
    if (!posted.ok) {
      console.error(`[alerts] ${instance.slug} status embed: ${posted.error}`);
      return;
    }
    if (posted.id) {
      updateInstance(instanceId, {
        discordStatusMessageId: posted.id,
        lastStatusEmbedAt: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.error(`[alerts] ${instance.slug} status embed failed:`, err);
  }
}

export async function deleteInstanceStatusEmbed(instanceId: string) {
  const instance = getInstance(instanceId);
  if (!instance?.discordStatusMessageId) return;

  const webhookUrl = resolveStatusWebhookUrl(instance);
  if (webhookUrl) {
    await deleteWebhookMessage(webhookUrl, instance.discordStatusMessageId);
  }
  updateInstance(instanceId, {
    discordStatusMessageId: null,
    lastStatusEmbedAt: null,
  });
}

export async function handleAlertsSettingsChange(before: InstanceRecord, after: InstanceRecord) {
  const prevEnabled = before.alerts?.statusEmbedEnabled ?? false;
  const nextEnabled = after.alerts?.statusEmbedEnabled ?? false;

  if (prevEnabled && !nextEnabled) {
    await deleteInstanceStatusEmbed(after.id);
    return;
  }

  if (nextEnabled) {
    await syncInstanceStatusEmbed(after.id, true);
  }
}

export async function monitorInstanceAlerts(instance: InstanceRecord) {
  const fresh = getInstance(instance.id);
  if (!fresh) return;

  if (fresh.alerts?.statusEmbedEnabled) {
    await syncInstanceStatusEmbed(fresh.id, false);
  }

  if (fresh.status !== "running") return;

  const fps = parseFpsFromLogs(fresh.profilePath);
  const threshold = fresh.alerts?.lowFpsThreshold ?? 30;

  if (fresh.alerts?.alertOnLowFps && fps != null && fps < threshold) {
    const last = fresh.lastLowFpsAlertAt ? new Date(fresh.lastLowFpsAlertAt).getTime() : 0;
    if (Date.now() - last >= LOW_FPS_ALERT_MIN_MS) {
      await sendInstanceAlert(
        fresh.id,
        "low-fps",
        `Server FPS dropped to ${fps.toFixed(1)} (threshold ${threshold})`,
        { fps: fps.toFixed(1), threshold },
      );
      updateInstance(fresh.id, { lastLowFpsAlertAt: new Date().toISOString() });
    }
  }

  if (fresh.alerts?.alertOnFpsRecovery && fps != null && fps >= threshold && fresh.lastLowFpsAlertAt) {
    const lastRecovery = fresh.lastLowFpsRecoveryAt ? new Date(fresh.lastLowFpsRecoveryAt).getTime() : 0;
    if (Date.now() - lastRecovery >= LOW_FPS_ALERT_MIN_MS) {
      await sendInstanceAlert(
        fresh.id,
        "fps-recovery",
        `Server FPS recovered to ${fps.toFixed(1)} (threshold ${threshold})`,
        { fps: fps.toFixed(1), threshold },
      );
      updateInstance(fresh.id, {
        lastLowFpsRecoveryAt: new Date().toISOString(),
        lastLowFpsAlertAt: null,
      });
    }
  }

  const settings = getSettings();
  if (settings.enableMemoryAlerts && fresh.alerts?.alertOnHighMemory) {
    const runtime = getRuntimeMeta(fresh);
    const memory = runtime.memoryMb ?? 0;
    if (memory >= settings.memoryAlertThresholdMb) {
      const last = fresh.lastMemoryAlertAt ? new Date(fresh.lastMemoryAlertAt).getTime() : 0;
      if (Date.now() - last >= MEMORY_ALERT_MIN_MS) {
        await sendInstanceAlert(
          fresh.id,
          "high-memory",
          `Server memory usage is ${memory} MB (threshold ${settings.memoryAlertThresholdMb} MB)`,
          { memoryMb: memory, thresholdMb: settings.memoryAlertThresholdMb },
        );
        updateInstance(fresh.id, { lastMemoryAlertAt: new Date().toISOString() });
      }
    }
  }

  try {
    const a2s = await queryInstanceA2s(fresh);
    if (a2s.players != null) {
      const prev = fresh.lastKnownPlayerCount;
      if (prev != null && a2s.players > prev && fresh.alerts?.alertOnPlayerJoin) {
        await sendInstanceAlert(
          fresh.id,
          "player-join",
          `Player count increased to ${a2s.playerCount}`,
          { players: a2s.players, maxPlayers: a2s.maxPlayers },
        );
      }
      if (prev != null && a2s.players < prev && fresh.alerts?.alertOnPlayerLeave) {
        await sendInstanceAlert(
          fresh.id,
          "player-leave",
          `Player count decreased to ${a2s.playerCount}`,
          { players: a2s.players, maxPlayers: a2s.maxPlayers },
        );
      }
      if (prev !== a2s.players) {
        updateInstance(fresh.id, { lastKnownPlayerCount: a2s.players });
      }
    }
  } catch {
    /* ignore query errors */
  }
}

export function normalizeInstanceAlerts(instance: InstanceRecord): InstanceRecord {
  return {
    ...instance,
    alerts: mergeInstanceAlerts(instance.alerts),
    discordStatusMessageId: instance.discordStatusMessageId ?? null,
    lastLowFpsAlertAt: instance.lastLowFpsAlertAt ?? null,
    lastLowFpsRecoveryAt: instance.lastLowFpsRecoveryAt ?? null,
    lastMemoryAlertAt: instance.lastMemoryAlertAt ?? null,
    lastStatusEmbedAt: instance.lastStatusEmbedAt ?? null,
    lastKnownPlayerCount: instance.lastKnownPlayerCount ?? null,
    lastJoinLeaveScanAt: instance.lastJoinLeaveScanAt ?? null,
  };
}

export async function notifyDiscord(
  event: InstanceAlertEvent,
  instance: InstanceRecord,
  message: string,
  extra?: Record<string, unknown>,
) {
  await sendInstanceAlert(instance.id, event, message, extra);
}

export async function notifyGameUpdate(branch: string, ok: boolean, detail: string) {
  const webhook = getSettings().discordWebhookUrl.trim();
  if (!webhook) return;
  await notifyDiscordLegacy(
    "game-update",
    { id: "global", name: "Game install", slug: branch, branch: branch as InstanceRecord["branch"], alerts: mergeInstanceAlerts() } as InstanceRecord,
    detail,
    webhook,
    { branch, ok: String(ok) },
  );
}

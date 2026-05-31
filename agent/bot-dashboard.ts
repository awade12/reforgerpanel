import type { BotDashboardSeedPing, BotDashboardSync, InstanceRecord } from "../lib/shared/types";
import { queryInstanceA2s } from "./a2s";
import { buildStatusEmbed } from "./alerts";
import { getBotRuntime, getInstance, getSettings, listInstances, updateBotRuntime, updateInstance } from "./db";

function parsePlayerCount(playerCount: string | null | undefined) {
  if (!playerCount || playerCount === "—") return null;
  const match = playerCount.match(/^(\d+)/);
  return match ? Number(match[1]) : null;
}

async function evaluateSeedPing(instance: InstanceRecord, emptyMinutes: number): Promise<BotDashboardSeedPing[]> {
  if (instance.status !== "running") {
    if (instance.discordBotEmptySince || instance.discordBotSeedPingAt) {
      updateInstance(instance.id, {
        discordBotEmptySince: null,
        discordBotSeedPingAt: null,
      });
    }
    return [];
  }

  let players: number | null = null;
  let label = "0";
  try {
    const a2s = await queryInstanceA2s(instance);
    players = a2s.players ?? parsePlayerCount(a2s.playerCount);
    label =
      a2s.playerCount && a2s.playerCount !== "—"
        ? a2s.playerCount
        : a2s.maxPlayers != null
          ? `0/${a2s.maxPlayers}`
          : "0";
  } catch {
    return [];
  }

  if (players == null) return [];

  if (players > 0) {
    if (instance.discordBotEmptySince || instance.discordBotSeedPingAt) {
      updateInstance(instance.id, {
        discordBotEmptySince: null,
        discordBotSeedPingAt: null,
      });
    }
    return [];
  }

  const now = new Date().toISOString();
  const emptySince = instance.discordBotEmptySince ?? now;
  if (!instance.discordBotEmptySince) {
    updateInstance(instance.id, { discordBotEmptySince: emptySince });
  }

  const emptyMs = Date.now() - Date.parse(emptySince);
  if (emptyMs >= emptyMinutes * 60_000 && !instance.discordBotSeedPingAt) {
    return [{ instanceId: instance.id, instanceName: instance.name, playerCount: label }];
  }

  return [];
}

export async function buildBotDashboardSync(): Promise<BotDashboardSync> {
  const settings = getSettings();
  const runtime = getBotRuntime();
  const alertRoleId = settings.discordAlertRoleId.trim();
  const seedRoleId = settings.discordBotSeedRoleId.trim();
  const emptyMinutes = settings.discordBotSeedEmptyMinutes;
  const seedEnabled = settings.discordBotSeedPingEnabled && Boolean(seedRoleId);

  const instances = listInstances();
  const rows = await Promise.all(
    instances.map(async (instance) => {
      const fresh = getInstance(instance.id) ?? instance;
      if (fresh.status !== "crashed" && fresh.discordBotCrashPingAt) {
        updateInstance(fresh.id, { discordBotCrashPingAt: null });
      }

      const embed = await buildStatusEmbed(fresh);
      const crashPing = fresh.status === "crashed" && !fresh.discordBotCrashPingAt;

      return {
        id: fresh.id,
        slug: fresh.slug,
        name: fresh.name,
        messageId: fresh.discordBotStatusMessageId,
        embed,
        crashPing,
      };
    }),
  );

  const seedPings: BotDashboardSeedPing[] = [];
  if (seedEnabled) {
    for (const instance of instances) {
      const fresh = getInstance(instance.id) ?? instance;
      seedPings.push(...(await evaluateSeedPing(fresh, emptyMinutes)));
    }
  } else {
    for (const instance of instances) {
      const fresh = getInstance(instance.id) ?? instance;
      if (fresh.discordBotEmptySince || fresh.discordBotSeedPingAt) {
        updateInstance(fresh.id, {
          discordBotEmptySince: null,
          discordBotSeedPingAt: null,
        });
      }
    }
  }

  return {
    maintenance: {
      enabled: settings.discordBotMaintenanceEnabled,
      message: settings.discordBotMaintenanceMessage.trim(),
      messageId: runtime.discordBotMaintenanceMessageId,
    },
    alertRoleId,
    seedRoleId,
    instances: rows,
    seedPings,
  };
}

export function ackBotDashboard(input: {
  crashPingInstanceIds?: string[];
  seedPingInstanceIds?: string[];
  maintenanceMessageId?: string | null;
}) {
  const now = new Date().toISOString();
  for (const id of input.crashPingInstanceIds ?? []) {
    ackBotCrashPing(id);
  }
  for (const id of input.seedPingInstanceIds ?? []) {
    updateInstance(id, { discordBotSeedPingAt: now });
  }
  if (input.maintenanceMessageId !== undefined) {
    updateBotRuntime({
      discordBotMaintenanceMessageId:
        input.maintenanceMessageId == null || input.maintenanceMessageId === ""
          ? null
          : input.maintenanceMessageId,
    });
  }
}

export function ackBotCrashPing(instanceId: string) {
  updateInstance(instanceId, { discordBotCrashPingAt: new Date().toISOString() });
}

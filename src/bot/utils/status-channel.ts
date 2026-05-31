import { EmbedBuilder, type Client, type TextChannel } from "discord.js";
import type { BotDashboardSync } from "@/lib/shared/types";
import { agentFetch } from "./agent";

const SYNC_MS = 60_000;
const MAINTENANCE_COLOR = 0xd4a574;

function roleMention(roleId: string) {
  return roleId ? `<@&${roleId}>` : "";
}

function maintenanceEmbed(message: string) {
  return new EmbedBuilder()
    .setColor(MAINTENANCE_COLOR)
    .setTitle("Scheduled maintenance")
    .setDescription(message || "Maintenance in progress — servers may restart.")
    .setFooter({ text: "Reforger Panel" })
    .setTimestamp();
}

async function syncMaintenanceBanner(text: TextChannel, maintenance: BotDashboardSync["maintenance"]) {
  const ack = (messageId: string | null) =>
    agentFetch("/bot/dashboard", {
      method: "PATCH",
      body: JSON.stringify({ maintenanceMessageId: messageId }),
    });

  if (!maintenance.enabled || !maintenance.message) {
    if (maintenance.messageId) {
      const existing = await text.messages.fetch(maintenance.messageId).catch(() => null);
      if (existing) await existing.delete().catch(() => undefined);
      await ack(null);
    }
    return;
  }

  const embed = maintenanceEmbed(maintenance.message);

  if (maintenance.messageId) {
    const existing = await text.messages.fetch(maintenance.messageId).catch(() => null);
    if (existing) {
      await existing.edit({ embeds: [embed] });
      if (!existing.pinned) await existing.pin().catch(() => undefined);
      return;
    }
  }

  const sent = await text.send({ embeds: [embed] });
  await sent.pin().catch(() => undefined);
  await ack(sent.id);
}

async function syncInstanceEmbeds(
  text: TextChannel,
  dashboard: BotDashboardSync,
  crashPingAcks: string[],
) {
  for (const row of dashboard.instances) {
    const embed = EmbedBuilder.from(row.embed);
    const content =
      row.crashPing && dashboard.alertRoleId
        ? `${roleMention(dashboard.alertRoleId)} **${row.name}** has crashed.`
        : undefined;

    if (row.messageId) {
      const existing = await text.messages.fetch(row.messageId).catch(() => null);
      if (existing) {
        await existing.edit({ content: content ?? "", embeds: [embed] });
        if (row.crashPing) crashPingAcks.push(row.id);
        continue;
      }
    }

    const sent = await text.send({ content, embeds: [embed] });
    if (row.crashPing) crashPingAcks.push(row.id);
    await agentFetch(`/instances/${row.id}/bot-status`, {
      method: "PATCH",
      body: JSON.stringify({ messageId: sent.id }),
    });
  }
}

async function sendSeedPings(text: TextChannel, dashboard: BotDashboardSync, seedPingAcks: string[]) {
  if (!dashboard.seedRoleId || !dashboard.seedPings.length) return;

  for (const ping of dashboard.seedPings) {
    const content = `${roleMention(dashboard.seedRoleId)} **${ping.instanceName}** is online with **${ping.playerCount}** players — come seed the server!`;
    await text.send({ content });
    seedPingAcks.push(ping.instanceId);
  }
}

export function startStatusChannelLoop(client: Client) {
  const sync = () => {
    void syncStatusChannel(client).catch((err) => {
      console.warn("[bot] status channel sync failed:", err instanceof Error ? err.message : err);
    });
  };

  sync();
  return setInterval(sync, SYNC_MS);
}

async function syncStatusChannel(client: Client) {
  let dashboard: BotDashboardSync;
  try {
    dashboard = await agentFetch<BotDashboardSync>("/bot/dashboard");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[bot] status channel sync failed (is the agent restarted after a panel update?): ${msg}`,
    );
    return;
  }

  const settings = await agentFetch<{ discordBotStatusChannelId?: string }>("/settings");
  const channelId = settings.discordBotStatusChannelId?.trim() ?? "";
  if (!channelId) return;

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased()) {
    console.warn("[bot] status channel missing or not text-based");
    return;
  }

  const text = channel as TextChannel;
  const crashPingAcks: string[] = [];
  const seedPingAcks: string[] = [];

  await syncMaintenanceBanner(text, dashboard.maintenance);
  await syncInstanceEmbeds(text, dashboard, crashPingAcks);
  await sendSeedPings(text, dashboard, seedPingAcks);

  if (crashPingAcks.length || seedPingAcks.length) {
    await agentFetch("/bot/dashboard", {
      method: "PATCH",
      body: JSON.stringify({
        crashPingInstanceIds: crashPingAcks,
        seedPingInstanceIds: seedPingAcks,
      }),
    });
  }
}

import { EmbedBuilder } from "discord.js";
import { PANEL_NAME } from "@/lib/shared/panel-brand";
import { brandColor, statusColor, statusLabel } from "./colors";
import type { HostStatus, InstanceWithConfig } from "../agent";
import { connectAddress, formatUptime, scenarioName } from "@/lib/shared/discord-status";

export function panelFooter(panelUrl?: string) {
  return { text: panelUrl ? `${PANEL_NAME} · open dashboard` : PANEL_NAME };
}

export function hostStatusEmbed(status: HostStatus, panelUrl?: string) {
  const { host, instances, overall } = status;
  const embed = new EmbedBuilder()
    .setColor(overall === "critical" ? 0xd46a5a : overall === "attention" ? 0xd4a574 : brandColor)
    .setTitle("Host status")
    .setDescription(`Overall: **${overall}**`)
    .addFields(
      { name: "Hostname", value: host.hostname, inline: true },
      { name: "Disk free", value: `${host.diskFreeGb} GB`, inline: true },
      { name: "Memory", value: `${host.memoryUsedMb} / ${host.memoryTotalMb} MB`, inline: true },
      { name: "Load", value: formatLoad(host.loadAvg), inline: true },
      { name: "Instances", value: `${instances.running}/${instances.total} running`, inline: true },
      { name: "Players", value: String(instances.totalPlayers), inline: true },
    )
    .setFooter(panelFooter(panelUrl))
    .setTimestamp();

  if (panelUrl) embed.setURL(panelUrl);
  return embed;
}

function formatLoad(load?: [number, number, number]) {
  if (!load) return "—";
  return load.map((n) => n.toFixed(2)).join(" · ");
}

export function instanceSummaryEmbed(instances: InstanceWithConfig[], panelUrl?: string) {
  const running = instances.filter((item) => item.status === "running").length;
  const crashed = instances.filter((item) => item.status === "crashed").length;

  const lines =
    instances.length === 0
      ? "No instances configured."
      : instances
          .slice(0, 12)
          .map((item) => `**${item.name}** \`${item.slug}\` — ${statusLabel(item.status)}`)
          .join("\n");

  const embed = new EmbedBuilder()
    .setColor(brandColor)
    .setTitle("Server instances")
    .setDescription(lines)
    .addFields(
      { name: "Total", value: String(instances.length), inline: true },
      { name: "Running", value: String(running), inline: true },
      { name: "Crashed", value: String(crashed), inline: true },
    )
    .setFooter(panelFooter(panelUrl))
    .setTimestamp();

  if (panelUrl) embed.setURL(panelUrl);
  return embed;
}

export function instanceStatusEmbed(instance: InstanceWithConfig, panelUrl?: string) {
  const config = instance.config ?? null;
  const runtime = instance.runtime;
  const address = connectAddress(config);
  const players = config?.game?.maxPlayers != null ? `0/${config.game.maxPlayers}` : "—";

  const embed = new EmbedBuilder()
    .setColor(statusColor(instance.status))
    .setTitle(instance.name)
    .setDescription(address !== "—" ? `**Connect** \`${address}\`` : "Public address not configured")
    .addFields(
      { name: "Status", value: statusLabel(instance.status), inline: true },
      { name: "Branch", value: instance.branch, inline: true },
      { name: "Slug", value: instance.slug, inline: true },
      { name: "Players", value: players, inline: true },
      {
        name: "Uptime",
        value: instance.status === "running" ? formatUptime(runtime?.uptimeSec) : "—",
        inline: true,
      },
      {
        name: "Memory",
        value: runtime?.memoryMb != null ? `${runtime.memoryMb} MB` : "—",
        inline: true,
      },
      { name: "Scenario", value: scenarioName(config), inline: false },
    )
    .setFooter({ text: instance.id })
    .setTimestamp();

  if (panelUrl) embed.setURL(`${panelUrl}/instances/${instance.id}`);
  return embed;
}

export function dashboardEmbed(status: HostStatus, panelUrl?: string) {
  const { host, instances } = status;

  const embed = new EmbedBuilder()
    .setColor(brandColor)
    .setAuthor({ name: `${PANEL_NAME} · Dashboard` })
    .setTitle(host.hostname)
    .setDescription(
      [
        `**Instances** ${instances.running}/${instances.total} running`,
        `**Players** ${instances.totalPlayers} online`,
        `**Disk** ${host.diskFreeGb} GB free`,
        `**Health** ${status.overall}`,
      ].join("\n"),
    )
    .setFooter(panelFooter(panelUrl))
    .setTimestamp();

  if (panelUrl) embed.setURL(panelUrl);

  if (instances.rows.length) {
    const top = instances.rows
      .slice(0, 8)
      .map((row) => `• **${row.name}** — ${statusLabel(row.status)}${row.playerCount ? ` · ${row.playerCount}` : ""}`)
      .join("\n");
    embed.addFields({ name: "Instances", value: top });
  }

  return embed;
}

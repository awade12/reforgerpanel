import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { PANEL_NAME } from "@/lib/shared/panel-brand";
import type { BotCommand } from "../../types/command";
import { brandColor } from "../../utils/embeds/colors";

export const command: BotCommand = {
  group: "gen",
  data: new SlashCommandBuilder().setName("help").setDescription(`List ${PANEL_NAME} bot commands`),
  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(brandColor)
      .setTitle(`${PANEL_NAME} bot`)
      .setDescription("Dashboard commands for your Arma Reforger host.")
      .addFields(
        {
          name: "General",
          value: ["`/dashboard` — host + instance overview", "`/instances` — list servers", "`/status` — instance details", "`/host` — host metrics", "`/ping` — latency check", "`/help` — this message"].join("\n"),
        },
        {
          name: "Admin",
          value: ["`/logs` — tail console logs", "`/start` — start instance", "`/stop` — stop instance", "`/restart` — restart instance"].join("\n"),
        },
      )
      .setFooter({ text: "Admin commands require the configured Discord admin role." });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

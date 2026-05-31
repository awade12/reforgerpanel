import { SlashCommandBuilder } from "discord.js";
import type { BotCommand } from "../../types/command";
import { loadBotConfig } from "../../config";
import type { HostStatus } from "../../utils/agent";
import { agentFetch } from "../../utils/agent";
import { dashboardEmbed } from "../../utils/embeds/dashboard";
import { deferPublic } from "../gen/utils/reply";

export const command: BotCommand = {
  group: "admin",
  data: new SlashCommandBuilder().setName("dashboard").setDescription("Host dashboard overview"),
  async execute(interaction) {
    await deferPublic(interaction);
    const config = loadBotConfig();
    const status = await agentFetch<HostStatus>("/host/status?quick=1");
    await interaction.editReply({
      embeds: [dashboardEmbed(status, config.panelUrl)],
    });
  },
};

import { SlashCommandBuilder } from "discord.js";
import type { BotCommand } from "../../types/command";
import { loadBotConfig } from "../../config";
import type { HostStatus } from "../../utils/agent";
import { agentFetch } from "../../utils/agent";
import { hostStatusEmbed } from "../../utils/embeds/dashboard";
import { deferPublic } from "../gen/utils/reply";

export const command: BotCommand = {
  group: "admin",
  data: new SlashCommandBuilder().setName("host").setDescription("Host CPU, memory, and disk metrics"),
  async execute(interaction) {
    await deferPublic(interaction);
    const config = loadBotConfig();
    const status = await agentFetch<HostStatus>("/host/status");
    await interaction.editReply({ embeds: [hostStatusEmbed(status, config.panelUrl)] });
  },
};

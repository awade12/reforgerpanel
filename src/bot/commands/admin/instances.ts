import { SlashCommandBuilder } from "discord.js";
import type { BotCommand } from "../../types/command";
import { loadBotConfig } from "../../config";
import { instanceSummaryEmbed } from "../../utils/embeds/dashboard";
import { listInstances } from "../../utils/instances";
import { deferPublic } from "../gen/utils/reply";

export const command: BotCommand = {
  group: "admin",
  data: new SlashCommandBuilder().setName("instances").setDescription("List all Reforger server instances"),
  async execute(interaction) {
    await deferPublic(interaction);
    const config = await loadBotConfig();
    const instances = await listInstances();
    await interaction.editReply({
      embeds: [instanceSummaryEmbed(instances, config.panelUrl)],
    });
  },
};

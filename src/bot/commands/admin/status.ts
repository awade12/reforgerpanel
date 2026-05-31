import { SlashCommandBuilder } from "discord.js";
import type { BotCommand } from "../../types/command";
import { loadBotConfig } from "../../config";
import { instanceStatusEmbed } from "../../utils/embeds/dashboard";
import { deferPublic } from "../gen/utils/reply";
import { autocompleteInstances, resolveSelectedInstance } from "./utils/instance";

export const command: BotCommand = {
  group: "admin",
  data: new SlashCommandBuilder()
    .setName("status")
    .setDescription("Live status for a server instance")
    .addStringOption((opt) =>
      opt.setName("instance").setDescription("Server instance").setRequired(true).setAutocomplete(true),
    ),
  autocomplete: autocompleteInstances,
  async execute(interaction) {
    await deferPublic(interaction);
    const instance = await resolveSelectedInstance(interaction);
    if (!instance) return;

    const config = await loadBotConfig();
    await interaction.editReply({
      embeds: [instanceStatusEmbed(instance, config.panelUrl)],
    });
  },
};

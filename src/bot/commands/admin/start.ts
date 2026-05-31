import { SlashCommandBuilder } from "discord.js";
import type { BotCommand } from "../../types/command";
import { autocompleteInstances } from "./utils/instance";
import { runLifecycleCommand } from "./utils/lifecycle";

export const command: BotCommand = {
  group: "admin",
  adminOnly: true,
  data: new SlashCommandBuilder()
    .setName("start")
    .setDescription("Start a server instance")
    .addStringOption((opt) =>
      opt.setName("instance").setDescription("Server instance").setRequired(true).setAutocomplete(true),
    ),
  autocomplete: autocompleteInstances,
  execute: (interaction) => runLifecycleCommand(interaction, "start"),
};

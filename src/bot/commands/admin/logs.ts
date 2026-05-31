import { SlashCommandBuilder } from "discord.js";
import type { BotCommand } from "../../types/command";
import { agentFetch } from "../../utils/agent";
import { deferPrivate } from "../gen/utils/reply";
import { autocompleteInstances, resolveSelectedInstance } from "./utils/instance";

function formatLogPayload(name: string, content: string, lines: number) {
  const trimmed = content.trim() || "(empty log file)";
  const header = `**${name}** · last ${lines} line(s)`;
  const block = trimmed.length > 1800 ? `${trimmed.slice(-1800)}` : trimmed;
  return `${header}\n\`\`\`\n${block}\n\`\`\``;
}

export const command: BotCommand = {
  group: "admin",
  adminOnly: true,
  data: new SlashCommandBuilder()
    .setName("logs")
    .setDescription("Tail recent console logs for an instance")
    .addStringOption((opt) =>
      opt.setName("instance").setDescription("Server instance").setRequired(true).setAutocomplete(true),
    )
    .addIntegerOption((opt) =>
      opt.setName("lines").setDescription("Lines to fetch (5–50)").setMinValue(5).setMaxValue(50),
    ),
  autocomplete: autocompleteInstances,
  async execute(interaction) {
    await deferPrivate(interaction);
    const instance = await resolveSelectedInstance(interaction);
    if (!instance) return;

    const lines = interaction.options.getInteger("lines") ?? 30;
    const data = await agentFetch<{ content: string; latest: string | null }>(
      `/instances/${instance.id}/logs?lines=${lines}`,
    );

    if (!data.latest) {
      await interaction.editReply(`**${instance.name}** — no log file found yet.`);
      return;
    }

    await interaction.editReply(formatLogPayload(instance.name, data.content, lines));
  },
};

import { SlashCommandBuilder } from "discord.js";
import type { BotCommand } from "../../types/command";

export const command: BotCommand = {
  group: "gen",
  data: new SlashCommandBuilder().setName("ping").setDescription("Check bot and panel agent latency"),
  async execute(interaction) {
    const sent = Date.now();
    await interaction.deferReply({ ephemeral: true });

    let agentMs: number | null = null;
    let agentOk = false;

    try {
      const start = Date.now();
      const { agentFetch } = await import("../../utils/agent");
      await agentFetch("/health");
      agentMs = Date.now() - start;
      agentOk = true;
    } catch {
      agentOk = false;
    }

    const rtt = Date.now() - sent;
    await interaction.editReply(
      [
        `**Discord** ${interaction.client.ws.ping}ms`,
        `**Round-trip** ${rtt}ms`,
        agentOk ? `**Agent** ${agentMs}ms · online` : "**Agent** offline",
      ].join("\n"),
    );
  },
};

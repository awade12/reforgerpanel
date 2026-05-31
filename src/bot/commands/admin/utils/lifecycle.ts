import type { ChatInputCommandInteraction } from "discord.js";
import { agentFetch } from "../../../utils/agent";
import { statusLabel } from "../../../utils/embeds/colors";
import { deferPublic } from "../../gen/utils/reply";
import { resolveSelectedInstance } from "./instance";

export async function runLifecycleCommand(
  interaction: ChatInputCommandInteraction,
  action: "start" | "stop" | "restart",
) {
  await deferPublic(interaction);
  const instance = await resolveSelectedInstance(interaction);
  if (!instance) return;

  const result = await agentFetch<{ status?: string; message?: string }>(`/instances/${instance.id}/${action}`, {
    method: "POST",
  });

  const status = result.status ?? instance.status;
  await interaction.editReply(
    `**${instance.name}** — ${action} sent.\nStatus: **${statusLabel(status)}**${result.message ? `\n${result.message}` : ""}`,
  );
}

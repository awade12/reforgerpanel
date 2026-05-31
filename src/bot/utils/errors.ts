import { AgentError } from "@/lib/agent-client";

export function userErrorMessage(err: unknown): string {
  if (err instanceof AgentError) {
    if (err.status === 503) return "Host agent is offline. Start it with `npm run agent`.";
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return "Something went wrong.";
}

export async function replyError(interaction: { reply: (payload: { content: string; ephemeral?: boolean }) => Promise<unknown> }, err: unknown) {
  const content = `**Error** — ${userErrorMessage(err)}`;
  await interaction.reply({ content, ephemeral: true });
}

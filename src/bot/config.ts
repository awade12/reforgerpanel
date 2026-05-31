import { z } from "zod";
import { agentFetch } from "./utils/agent";
import { resolveDiscordBotConfig } from "@/lib/shared/discord-bot-settings";
import type { SettingsRecord } from "@/lib/shared/types";

const schema = z.object({
  token: z.string().min(1),
  clientId: z.string().min(1),
  guildId: z.string().optional(),
  adminRoleId: z.string().optional(),
  panelUrl: z.string().optional(),
});

export type BotConfig = z.infer<typeof schema>;

export async function loadBotConfig(): Promise<BotConfig> {
  let settings: SettingsRecord | null = null;

  try {
    settings = await agentFetch<SettingsRecord>("/settings");
  } catch {
    console.warn("[bot] Could not load panel settings from agent");
  }

  const resolved = resolveDiscordBotConfig(settings ?? ({} as SettingsRecord));
  if (!resolved) {
    if (settings && !settings.discordBotEnabled) {
      throw new Error("Discord bot is disabled. Enable it under Discord in the panel and save the bot token and client ID.");
    }
    throw new Error(
      "Discord bot is not configured. Set the bot token and client ID under Discord in the panel, then restart the bot.",
    );
  }

  const parsed = schema.safeParse(resolved);
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join("; ");
    throw new Error(`Discord bot config invalid: ${message}`);
  }

  console.log("[bot] Using credentials from panel settings");
  return parsed.data;
}

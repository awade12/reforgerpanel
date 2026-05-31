import { buildDiscordBotInviteUrl } from "../lib/shared/discord-bot-settings";
import type { DiscordBotStatusResponse } from "../lib/shared/types";
import { getBotRuntime, getSettings, listInstances } from "./db";
import { buildStatusEmbed } from "./alerts";

const HEARTBEAT_TTL_MS = 90_000;

export function getDiscordBotStatus(): DiscordBotStatusResponse {
  const settings = getSettings();
  const runtime = getBotRuntime();
  const lastSeenMs = runtime.lastSeenAt ? Date.parse(runtime.lastSeenAt) : 0;
  const connected = Boolean(lastSeenMs && Date.now() - lastSeenMs < HEARTBEAT_TTL_MS);

  return {
    connected,
    lastSeenAt: runtime.lastSeenAt,
    lastDeployAt: runtime.lastDeployAt,
    username: runtime.username,
    tag: runtime.tag,
    inviteUrl: buildDiscordBotInviteUrl(settings.discordBotClientId, settings.discordBotGuildId),
  };
}

export async function listBotStatusEmbeds() {
  const instances = listInstances();
  return Promise.all(
    instances.map(async (instance) => ({
      id: instance.id,
      slug: instance.slug,
      name: instance.name,
      messageId: instance.discordBotStatusMessageId,
      embed: await buildStatusEmbed(instance),
    })),
  );
}

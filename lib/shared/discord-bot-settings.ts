import type { SettingsRecord } from "./types";

export function resolveDiscordBotConfig(settings: SettingsRecord): ResolvedDiscordBotConfig | null {
  if (!settings.discordBotEnabled) {
    return null;
  }

  const token = settings.discordBotToken.trim();
  const clientId = settings.discordBotClientId.trim();
  if (!token || !clientId) return null;

  const guildId = settings.discordBotGuildId.trim() || undefined;
  const adminRoleId = settings.discordBotAdminRoleId.trim() || settings.discordAlertRoleId.trim() || undefined;
  const panelUrl = process.env.PANEL_PUBLIC_URL?.trim() || process.env.NEXT_PUBLIC_PANEL_URL?.trim() || undefined;

  return { token, clientId, guildId, adminRoleId, panelUrl };
}

export type ResolvedDiscordBotConfig = {
  token: string;
  clientId: string;
  guildId?: string;
  adminRoleId?: string;
  panelUrl?: string;
};

export async function verifyDiscordBotToken(token: string) {
  const res = await fetch("https://discord.com/api/v10/users/@me", {
    headers: { Authorization: `Bot ${token}` },
  });
  if (!res.ok) {
    const detail = (await res.text()).trim().slice(0, 200);
    throw new Error(detail ? `Discord ${res.status}: ${detail}` : `Discord returned HTTP ${res.status}`);
  }
  return (await res.json()) as { id: string; username: string };
}

const BOT_PERMISSIONS = 84992;

export function buildDiscordBotInviteUrl(clientId: string, guildId?: string) {
  const id = clientId.trim();
  if (!id) return null;
  const params = new URLSearchParams({
    client_id: id,
    permissions: String(BOT_PERMISSIONS),
    scope: "bot applications.commands",
  });
  if (guildId?.trim()) {
    params.set("guild_id", guildId.trim());
    params.set("disable_guild_select", "true");
  }
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

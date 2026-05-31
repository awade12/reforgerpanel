import type { ChatInputCommandInteraction, GuildMemberRoleManager } from "discord.js";
import type { BotConfig } from "../config";

function memberRoles(interaction: ChatInputCommandInteraction): GuildMemberRoleManager | null {
  if (!interaction.inGuild() || !interaction.member || typeof interaction.member.roles === "string") {
    return null;
  }
  return interaction.member.roles;
}

export function isAdmin(interaction: ChatInputCommandInteraction, config: BotConfig): boolean {
  if (!config.adminRoleId) return interaction.inGuild();
  const roles = memberRoles(interaction);
  if (!roles) return false;
  return roles.cache.has(config.adminRoleId);
}

export async function requireAdmin(
  interaction: ChatInputCommandInteraction,
  config: BotConfig,
): Promise<boolean> {
  if (isAdmin(interaction, config)) return true;

  const hint = config.adminRoleId
    ? "You need the configured admin role to run this command."
    : "Set an admin role ID in Settings → Discord bot.";

  await interaction.reply({ content: hint, ephemeral: true });
  return false;
}

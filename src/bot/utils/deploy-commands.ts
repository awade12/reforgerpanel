import { REST, Routes } from "discord.js";
import type { BotConfig } from "../config";
import type { BotCommand } from "../types/command";
import { commandPayload } from "./load-commands";

export async function deployCommands(config: BotConfig, commands: Map<string, BotCommand>) {
  const rest = new REST({ version: "10" }).setToken(config.token);
  const body = commandPayload(commands);

  if (config.guildId) {
    await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body });
    console.log(`[bot] Deployed ${body.length} guild command(s) to ${config.guildId}`);
    return;
  }

  await rest.put(Routes.applicationCommands(config.clientId), { body });
  console.log(`[bot] Deployed ${body.length} global command(s) — may take up to an hour to propagate`);
}

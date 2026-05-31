import {
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { BotConfig } from "./config";
import type { BotCommand } from "./types/command";
import { startHeartbeatLoop } from "./utils/heartbeat";
import { startStatusChannelLoop } from "./utils/status-channel";
import { requireAdmin } from "./utils/permissions";
import { replyError, userErrorMessage } from "./utils/errors";

export function createBotClient(config: BotConfig, commands: Map<string, BotCommand>, deployedAt: string) {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  const registry = new Collection<string, BotCommand>(commands);

  client.once(Events.ClientReady, (ready) => {
    console.log(`[bot] Logged in as ${ready.user.tag}`);
    startHeartbeatLoop(client, deployedAt);
    startStatusChannelLoop(client);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isAutocomplete()) {
      await handleAutocomplete(registry, interaction);
      return;
    }

    if (!interaction.isChatInputCommand()) return;
    await handleCommand(config, registry, interaction);
  });

  return client;
}

async function handleAutocomplete(registry: Collection<string, BotCommand>, interaction: AutocompleteInteraction) {
  const command = registry.get(interaction.commandName);
  if (!command?.autocomplete) return;

  try {
    await command.autocomplete(interaction);
  } catch (err) {
    console.error(`[bot] autocomplete ${interaction.commandName}:`, userErrorMessage(err));
  }
}

async function handleCommand(
  config: BotConfig,
  registry: Collection<string, BotCommand>,
  interaction: ChatInputCommandInteraction,
) {
  const command = registry.get(interaction.commandName);
  if (!command) return;

  if (command.adminOnly && !(await requireAdmin(interaction, config))) return;

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(`[bot] ${interaction.commandName}:`, err);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: userErrorMessage(err), ephemeral: true }).catch(() => undefined);
      return;
    }
    await replyError(interaction, err);
  }
}

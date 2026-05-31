import "../../lib/shared/load-env";
import path from "path";
import { loadBotConfig } from "./config";
import { createBotClient } from "./client";
import { deployCommands } from "./utils/deploy-commands";
import { loadCommands } from "./utils/load-commands";

const commandsDir = path.join(process.cwd(), "src/bot/commands");

async function main() {
  const config = await loadBotConfig();
  const commands = await loadCommands(commandsDir);

  if (commands.size === 0) {
    throw new Error(`No commands found in ${commandsDir}`);
  }

  console.log(`[bot] Loaded ${commands.size} command(s): ${[...commands.keys()].join(", ")}`);
  const deployedAt = new Date().toISOString();
  await deployCommands(config, commands);

  const client = createBotClient(config, commands, deployedAt);
  await client.login(config.token);
}

main().catch((err) => {
  console.error("[bot] Fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});

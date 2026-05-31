import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import type { BotCommand } from "../types/command";

function isCommandFile(name: string) {
  return name.endsWith(".ts") && !name.endsWith(".d.ts");
}

function shouldSkipDir(name: string) {
  return name === "utils" || name.startsWith("_");
}

export async function loadCommands(commandsRoot: string): Promise<Map<string, BotCommand>> {
  const commands = new Map<string, BotCommand>();

  async function walk(dir: string) {
    if (!fs.existsSync(dir)) return;

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (shouldSkipDir(entry.name)) continue;
        await walk(fullPath);
        continue;
      }

      if (!isCommandFile(entry.name)) continue;

      const mod = (await import(pathToFileURL(fullPath).href)) as { command?: BotCommand };
      if (!mod.command?.data?.name || typeof mod.command.execute !== "function") continue;

      if (commands.has(mod.command.data.name)) {
        throw new Error(`Duplicate command name: ${mod.command.data.name}`);
      }

      commands.set(mod.command.data.name, mod.command);
    }
  }

  await walk(commandsRoot);
  return commands;
}

export function commandPayload(commands: Map<string, BotCommand>) {
  return [...commands.values()].map((command) => command.data.toJSON());
}

import type { Client } from "discord.js";
import { agentFetch } from "./agent";

export async function sendBotHeartbeat(input?: { username?: string; tag?: string; deployedAt?: string }) {
  await agentFetch("/bot/heartbeat", {
    method: "POST",
    body: JSON.stringify(input ?? {}),
  });
}

export function startHeartbeatLoop(client: Client, deployedAt: string) {
  let first = true;

  const beat = () => {
    void sendBotHeartbeat({
      ...(first ? { deployedAt } : {}),
      username: client.user?.username,
      tag: client.user?.tag ?? undefined,
    }).catch((err) => {
      console.warn("[bot] heartbeat failed:", err instanceof Error ? err.message : err);
    });
    first = false;
  };

  beat();
  return setInterval(beat, 30_000);
}

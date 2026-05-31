import { installOrUpdate } from "./steamcmd";
import { getSettings, listInstances } from "./db";
import { startInstanceById, stopInstanceById } from "./instances";
import { notifyDiscordPlain } from "./discord";
import { notifyGameUpdate } from "./alerts";
import { queryInstanceA2s } from "./a2s";

let scheduledRunning = false;
let digestSentKey = "";

export async function runScheduledUpdate() {
  if (scheduledRunning) return;
  scheduledRunning = true;
  try {
    const settings = getSettings();
    const webhook = settings.discordWebhookUrl;
    const instances = listInstances();
    const runningIds = instances.filter((item) => item.status === "running").map((item) => item.id);

    await notifyDiscordPlain("Scheduled update", "Stopping instances and updating stable server", webhook);
    for (const instance of instances) {
      try {
        await stopInstanceById(instance.id);
      } catch {
        /* ignore */
      }
    }
    const result = await installOrUpdate("stable");
    await notifyGameUpdate("stable", result.ok, result.ok ? "Stable server updated successfully" : "Stable server update failed");
    await notifyDiscordPlain(
      "Scheduled update",
      result.ok ? "Stable server updated successfully" : "Stable server update failed — check agent logs",
      webhook,
    );

    if (settings.enableModAwareUpdates && result.ok) {
      for (const id of runningIds) {
        try {
          await startInstanceById(id);
        } catch {
          /* ignore restart failures */
        }
      }
    }
  } finally {
    scheduledRunning = false;
  }
}

export async function runDailyDigest() {
  const settings = getSettings();
  const webhook = settings.discordWebhookUrl.trim();
  if (!webhook) return;

  const lines: string[] = [];
  for (const instance of listInstances()) {
    let extra = instance.status;
    if (instance.status === "running") {
      try {
        const a2s = await queryInstanceA2s(instance);
        extra = a2s.listed ? `${a2s.playerCount} · listed` : `${instance.status} · not listed`;
      } catch {
        extra = instance.status;
      }
    }
    lines.push(`• **${instance.name}** (${instance.slug}) — ${extra}`);
  }

  await notifyDiscordPlain(
    "Daily server digest",
    lines.length ? lines.join("\n") : "No instances configured.",
    webhook,
  );
}

export function startScheduledUpdateLoop() {
  setInterval(() => {
    const settings = getSettings();
    if (settings.enableScheduledUpdates) {
      const cron = settings.scheduledUpdateCron || "0 4 * * *";
      if (matchesSimpleCron(cron)) {
        void runScheduledUpdate();
      }
    }

    if (settings.enableDailyDigest) {
      const cron = settings.dailyDigestCron || "0 8 * * *";
      const key = `${new Date().toISOString().slice(0, 10)}:${cron}`;
      if (matchesSimpleCron(cron) && digestSentKey !== key) {
        digestSentKey = key;
        void runDailyDigest();
      }
    }
  }, 60_000);
}

function matchesSimpleCron(expr: string): boolean {
  const parts = expr.trim().split(/\s+/);
  if (parts.length < 2) return false;
  const now = new Date();
  const minute = parts[0];
  const hour = parts[1];
  const minuteOk = minute === "*" || Number(minute) === now.getUTCMinutes();
  const hourOk = hour === "*" || Number(hour) === now.getUTCHours();
  return minuteOk && hourOk && now.getUTCSeconds() < 5;
}

export { getSettings } from "./db";

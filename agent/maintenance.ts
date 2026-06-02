import fs from "fs";
import { HttpError } from "../lib/shared/http-error";
import { mergeInstanceAlerts } from "../lib/shared/alerts";
import { cronRunKey, describeNextCronRun, matchesSimpleCron } from "../lib/shared/game-update";
import type { MaintenanceRestartJobState } from "../lib/shared/types";
import { addAudit, getSettings, listInstances, saveSettings } from "./db";
import { createInstanceBackup } from "./backup";
import { reconcileInstanceStatus } from "./instance-state";
import { restartInstanceById } from "./instances";
import { isGameUpdateRunning } from "./monitor";
import { notifyDiscordPlain } from "./discord";

let maintenanceJob: MaintenanceRestartJobState = {
  running: false,
  trigger: null,
  ok: null,
  error: null,
  startedAt: null,
  finishedAt: null,
  restartedInstances: [],
  backedUpInstances: [],
  nextScheduledAt: null,
};

let scheduledRestartKey = "";

function snapshotRestartTargets(scope: "all" | "running") {
  const items: { id: string; slug: string }[] = [];
  for (const raw of listInstances()) {
    const instance = reconcileInstanceStatus(raw);
    if (scope === "all" || instance.status === "running" || instance.status === "starting") {
      items.push({ id: instance.id, slug: instance.slug });
    }
  }
  return items;
}

function maintenanceMessage(settings: ReturnType<typeof getSettings>) {
  const custom = settings.maintenanceRestartMessage?.trim();
  if (custom) return custom;
  return "Scheduled server maintenance — instances are restarting. Please wait a few minutes.";
}

export function getMaintenanceRestartJob(): MaintenanceRestartJobState {
  const settings = getSettings();
  return {
    ...maintenanceJob,
    nextScheduledAt: settings.enableScheduledRestarts
      ? describeNextCronRun(settings.scheduledRestartCron || "0 5 * * 0")
      : null,
  };
}

export async function runMaintenanceRestart(options: { trigger: "scheduled" | "manual" }) {
  if (maintenanceJob.running) {
    throw new HttpError(409, "Maintenance restart already running");
  }
  if (isGameUpdateRunning()) {
    throw new HttpError(409, "Game update is running — wait for it to finish");
  }

  const settings = getSettings();
  const scope = settings.scheduledRestartScope === "running" ? "running" : "all";
  const targets = snapshotRestartTargets(scope);
  const previousMaintenanceEnabled = settings.discordBotMaintenanceEnabled;
  const previousMaintenanceMessage = settings.discordBotMaintenanceMessage;

  maintenanceJob = {
    running: true,
    trigger: options.trigger,
    ok: null,
    error: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    restartedInstances: [],
    backedUpInstances: [],
    nextScheduledAt: null,
  };

  const webhook = settings.discordWebhookUrl;
  await notifyDiscordPlain(
    options.trigger === "scheduled" ? "Scheduled restart" : "Maintenance restart",
    scope === "running"
      ? `Restarting ${targets.length} running instance(s)…`
      : `Restarting ${targets.length} instance(s)…`,
    webhook,
  );

  try {
    if (settings.enableMaintenanceBeforeRestart) {
      saveSettings({
        discordBotMaintenanceEnabled: true,
        discordBotMaintenanceMessage: maintenanceMessage(settings),
      });
    }

    if (settings.autoBackupBeforeRestart) {
      for (const target of targets) {
        try {
          createInstanceBackup(target.id, { label: "pre-restart" });
          maintenanceJob.backedUpInstances.push(target.slug);
        } catch (err) {
          console.error("[maintenance] backup failed for", target.slug, err);
        }
      }
    }

    let allOk = true;
    for (const target of targets) {
      try {
        await restartInstanceById(target.id);
        maintenanceJob.restartedInstances.push(target.slug);
      } catch (err) {
        allOk = false;
        console.error("[maintenance] restart failed for", target.slug, err);
      }
    }

    maintenanceJob.ok = allOk;
    maintenanceJob.error = allOk ? null : "One or more instances failed to restart";

    addAudit(
      "maintenance.restart",
      `${options.trigger} · ${maintenanceJob.restartedInstances.join(", ") || "none"}${maintenanceJob.backedUpInstances.length ? ` · backup ${maintenanceJob.backedUpInstances.join(", ")}` : ""}`,
    );

    await notifyDiscordPlain(
      options.trigger === "scheduled" ? "Scheduled restart complete" : "Maintenance restart complete",
      allOk
        ? `Restarted ${maintenanceJob.restartedInstances.length} instance(s)${maintenanceJob.backedUpInstances.length ? ` · backup saved for ${maintenanceJob.backedUpInstances.length}` : ""}`
        : "Some instances failed to restart — check the panel",
      webhook,
    );
  } catch (err) {
    maintenanceJob.ok = false;
    maintenanceJob.error = err instanceof Error ? err.message : String(err);
    addAudit("maintenance.restart", `${options.trigger}: failed · ${maintenanceJob.error}`);
  } finally {
    if (settings.enableMaintenanceBeforeRestart) {
      saveSettings({
        discordBotMaintenanceEnabled: previousMaintenanceEnabled,
        discordBotMaintenanceMessage: previousMaintenanceMessage,
      });
    }
    maintenanceJob.running = false;
    maintenanceJob.finishedAt = new Date().toISOString();
  }

  return getMaintenanceRestartJob();
}

export function isMaintenanceRunning() {
  return maintenanceJob.running;
}

export function startMaintenanceRestartJob(trigger: "scheduled" | "manual") {
  void runMaintenanceRestart({ trigger });
  return getMaintenanceRestartJob();
}

export function startScheduledRestartLoop() {
  setInterval(() => {
    const settings = getSettings();
    if (!settings.enableScheduledRestarts || maintenanceJob.running || isGameUpdateRunning()) return;
    const cron = settings.scheduledRestartCron || "0 5 * * 0";
    const key = cronRunKey(cron);
    if (matchesSimpleCron(cron) && scheduledRestartKey !== key) {
      scheduledRestartKey = key;
      void runMaintenanceRestart({ trigger: "scheduled" });
    }
  }, 60_000);
}

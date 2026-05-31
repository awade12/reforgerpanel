import type { Branch } from "../lib/shared/types";
import { HttpError } from "../lib/shared/http-error";
import {
  branchesForInstances,
  cronRunKey,
  describeNextCronRun,
  matchesSimpleCron,
  type GameUpdateJobState,
  type GameUpdateTrigger,
} from "../lib/shared/game-update";
import { installOrUpdate, getInstallJob } from "./steamcmd";
import { addAudit, getSettings, listInstances } from "./db";
import { reconcileInstanceStatus } from "./instance-state";
import { startInstanceById, stopInstanceById } from "./instances";
import { notifyDiscordPlain } from "./discord";
import { notifyGameUpdate } from "./alerts";

let updateJob: GameUpdateJobState = {
  running: false,
  trigger: null,
  ok: null,
  lines: [],
  error: null,
  startedAt: null,
  finishedAt: null,
  branches: [],
  restartedInstances: [],
  stoppedInstances: [],
  nextScheduledAt: null,
};

let scheduledRunKey = "";
let digestSentKey = "";

function pushLine(line: string) {
  updateJob.lines.push(line);
  if (updateJob.lines.length > 500) updateJob.lines.shift();
}

export function getGameUpdateJob(): GameUpdateJobState {
  const settings = getSettings();
  return {
    ...updateJob,
    lines: [...updateJob.lines],
    nextScheduledAt: settings.enableScheduledUpdates
      ? describeNextCronRun(settings.scheduledUpdateCron || "0 4 * * *")
      : null,
  };
}

export function isGameUpdateRunning() {
  return updateJob.running;
}

function assertUpdateAvailable() {
  if (updateJob.running) {
    throw new Error("Game update already running");
  }
  if (getInstallJob().running) {
    throw new Error("SteamCMD install already running — wait for it to finish");
  }
}

function snapshotRunningInstances() {
  const running: { id: string; slug: string; branch: Branch }[] = [];
  for (const raw of listInstances()) {
    const instance = reconcileInstanceStatus(raw);
    if (instance.status === "running" || instance.status === "starting") {
      running.push({ id: instance.id, slug: instance.slug, branch: instance.branch });
    }
  }
  return running;
}

export async function runGameUpdate(options: {
  trigger: GameUpdateTrigger;
  restartInstances?: boolean;
}) {
  assertUpdateAvailable();

  const settings = getSettings();
  const restartInstances = options.restartInstances ?? settings.enableModAwareUpdates;
  const runningBefore = snapshotRunningInstances();
  const branches = branchesForInstances(runningBefore.map((item) => item.branch));

  updateJob = {
    running: true,
    trigger: options.trigger,
    ok: null,
    lines: [`Starting ${options.trigger} game update…`],
    error: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    branches,
    restartedInstances: [],
    stoppedInstances: [],
    nextScheduledAt: null,
  };

  const webhook = settings.discordWebhookUrl;
  await notifyDiscordPlain(
    options.trigger === "scheduled" ? "Scheduled update" : "Manual game update",
    `Stopping instances and updating: ${branches.join(", ")}`,
    webhook,
  );

  try {
    for (const instance of listInstances()) {
      try {
        await stopInstanceById(instance.id);
        updateJob.stoppedInstances.push(instance.slug);
        pushLine(`Stopped ${instance.slug}`);
      } catch (err) {
        pushLine(`Stop skipped for ${instance.slug}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    let allOk = true;
    for (const branch of branches) {
      pushLine(`Updating ${branch} via SteamCMD…`);
      const result = await installOrUpdate(branch, (line) => pushLine(line));
      await notifyGameUpdate(
        branch,
        result.ok,
        result.ok ? `${branch} server updated successfully` : `${branch} server update failed`,
      );
      if (!result.ok) allOk = false;
    }

    if (restartInstances && allOk) {
      for (const item of runningBefore) {
        try {
          await startInstanceById(item.id);
          updateJob.restartedInstances.push(item.slug);
          pushLine(`Restarted ${item.slug}`);
        } catch (err) {
          pushLine(`Restart failed for ${item.slug}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    } else if (!restartInstances) {
      pushLine("Restart after update disabled — instances left stopped");
    }

    updateJob.ok = allOk;
    updateJob.error = allOk ? null : "One or more SteamCMD updates failed";
    addAudit("game.update", `${options.trigger}: ${branches.join(", ")} · ${allOk ? "ok" : "failed"}`);
    await notifyDiscordPlain(
      options.trigger === "scheduled" ? "Scheduled update" : "Manual game update",
      allOk
        ? `Updated ${branches.join(", ")}${restartInstances ? ` · restarted ${updateJob.restartedInstances.length} instance(s)` : ""}`
        : "Game update failed — check agent logs",
      webhook,
    );
  } catch (err) {
    updateJob.ok = false;
    updateJob.error = err instanceof Error ? err.message : String(err);
    pushLine(updateJob.error);
    addAudit("game.update", `${options.trigger}: failed · ${updateJob.error}`);
  } finally {
    updateJob.running = false;
    updateJob.finishedAt = new Date().toISOString();
  }

  return getGameUpdateJob();
}

export function startGameUpdateJob(trigger: GameUpdateTrigger) {
  try {
    assertUpdateAvailable();
  } catch (err) {
    throw new HttpError(409, err instanceof Error ? err.message : "Game update unavailable");
  }
  void runGameUpdate({ trigger });
  return getGameUpdateJob();
}

export async function runScheduledUpdate() {
  return runGameUpdate({ trigger: "scheduled" });
}

export async function runDailyDigest() {
  const settings = getSettings();
  const webhook = settings.discordWebhookUrl.trim();
  if (!webhook) return;

  const lines: string[] = [];
  for (const raw of listInstances()) {
    const instance = reconcileInstanceStatus(raw);
    let extra = instance.status;
    if (instance.status === "running") {
      try {
        const { queryInstanceA2s } = await import("./a2s");
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
    if (settings.enableScheduledUpdates && !updateJob.running) {
      const cron = settings.scheduledUpdateCron || "0 4 * * *";
      const key = cronRunKey(cron);
      if (matchesSimpleCron(cron) && scheduledRunKey !== key) {
        scheduledRunKey = key;
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

export { getSettings } from "./db";

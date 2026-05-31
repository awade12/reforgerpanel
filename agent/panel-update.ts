import { execFileSync, spawn } from "child_process";
import fs from "fs";
import path from "path";
import { HttpError } from "../lib/shared/http-error";
import { cronRunKey, describeNextCronRun, matchesSimpleCron } from "../lib/shared/game-update";
import { agentConfig } from "./config";
import { getSettings } from "./db";
import { addAudit } from "./db";

export type PanelUpdateState = {
  running: boolean;
  ok: boolean | null;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  commitBefore: string | null;
  commitAfter: string | null;
  behindCommits: number | null;
  currentCommit: string | null;
  branch: string | null;
  nextScheduledAt: string | null;
  logFile: string;
};

const LOG_FILE = process.env.PANEL_UPDATE_LOG_FILE ?? "/var/log/reforgerpanel-update.log";
const statePath = () => path.join(agentConfig.dataDir, "panel-update-state.json");

let panelUpdateRunning = false;
let scheduledPanelRunKey = "";

function readPersistedState(): Partial<PanelUpdateState> {
  try {
    if (fs.existsSync(statePath())) {
      return JSON.parse(fs.readFileSync(statePath(), "utf8")) as Partial<PanelUpdateState>;
    }
  } catch {
    /* ignore */
  }
  return {};
}

function gitOutput(args: string[]) {
  return execFileSync("git", args, {
    cwd: agentConfig.panelRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function readGitStatus() {
  try {
    const branch = gitOutput(["rev-parse", "--abbrev-ref", "HEAD"]);
    const currentCommit = gitOutput(["rev-parse", "--short", "HEAD"]);
    let behindCommits = 0;
    try {
      gitOutput(["fetch", "origin"]);
      const resolvedBranch = branch === "HEAD" ? "main" : branch;
      const remote = gitOutput(["rev-parse", "--short", `origin/${resolvedBranch}`]);
      if (remote !== currentCommit) {
        const count = gitOutput(["rev-list", "--count", `HEAD..origin/${resolvedBranch}`]);
        behindCommits = Number(count) || 0;
      }
    } catch {
      behindCommits = null;
    }
    return { branch, currentCommit, behindCommits };
  } catch {
    return { branch: null, currentCommit: null, behindCommits: null };
  }
}

export function getPanelUpdateStatus(): PanelUpdateState {
  const settings = getSettings();
  const persisted = readPersistedState();
  const git = readGitStatus();
  return {
    running: panelUpdateRunning || (persisted.running === true && !persisted.finishedAt),
    ok: persisted.ok ?? null,
    error: persisted.error ?? null,
    startedAt: persisted.startedAt ?? null,
    finishedAt: persisted.finishedAt ?? null,
    commitBefore: persisted.commitBefore ?? null,
    commitAfter: persisted.commitAfter ?? null,
    behindCommits: git.behindCommits,
    currentCommit: git.currentCommit,
    branch: git.branch,
    nextScheduledAt: settings.enableScheduledPanelUpdates
      ? describeNextCronRun(settings.scheduledPanelUpdateCron || "0 3 * * 0")
      : null,
    logFile: LOG_FILE,
  };
}

export function isPanelUpdateRunning() {
  return panelUpdateRunning;
}

export function startPanelUpdate(trigger: "manual" | "scheduled") {
  if (panelUpdateRunning) {
    throw new HttpError(409, "Panel update already running");
  }

  const script = path.join(agentConfig.panelRoot, "scripts/update-panel.sh");
  if (!fs.existsSync(script)) {
    throw new HttpError(500, "scripts/update-panel.sh not found");
  }

  panelUpdateRunning = true;
  const startedAt = new Date().toISOString();
  const git = readGitStatus();

  fs.mkdirSync(agentConfig.dataDir, { recursive: true });
  fs.writeFileSync(
    statePath(),
    JSON.stringify(
      {
        running: true,
        ok: null,
        error: null,
        startedAt,
        finishedAt: null,
        commitBefore: git.currentCommit,
        commitAfter: null,
      },
      null,
      2,
    ),
  );

  addAudit("panel.update", `${trigger} started · ${git.currentCommit ?? "unknown"}`);

  const child = spawn(
    "bash",
    [script, agentConfig.panelRoot],
    {
      detached: true,
      stdio: "ignore",
      env: {
        ...process.env,
        PANEL_UPDATE_STATE_FILE: statePath(),
        PANEL_UPDATE_LOG_FILE: LOG_FILE,
        PANEL_USER: agentConfig.runAsUser,
      },
    },
  );
  child.unref();

  return getPanelUpdateStatus();
}

export function startPanelUpdateLoop() {
  setInterval(() => {
    const settings = getSettings();
    if (!settings.enableScheduledPanelUpdates || panelUpdateRunning) return;
    const cron = settings.scheduledPanelUpdateCron || "0 3 * * 0";
    const key = cronRunKey(cron);
    if (matchesSimpleCron(cron) && scheduledPanelRunKey !== key) {
      scheduledPanelRunKey = key;
      try {
        startPanelUpdate("scheduled");
      } catch {
        /* ignore */
      }
    }
  }, 60_000);
}

export function clearPanelUpdateRunningFlag() {
  panelUpdateRunning = false;
}

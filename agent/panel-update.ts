import { execFileSync, spawn } from "child_process";
import fs from "fs";
import path from "path";
import { HttpError } from "../lib/shared/http-error";
import { cronRunKey, describeNextCronRun, matchesSimpleCron } from "../lib/shared/game-update";
import { agentConfig } from "./config";
import { addAudit, getSettings } from "./db";

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
  logTail: string[];
  phase: string | null;
  elapsedSec: number | null;
};

const STALE_UPDATE_MS = 25 * 60 * 1000;
const STALE_NO_PROCESS_MS = 30_000;
const GIT_CACHE_MS = 60_000;

const statePath = () => path.join(agentConfig.dataDir, "panel-update-state.json");
const logPath = () => path.join(agentConfig.dataDir, "panel-update.log");

let panelUpdateRunning = false;
let scheduledPanelRunKey = "";
let gitCache: { at: number; branch: string | null; currentCommit: string | null; behindCommits: number | null } | null =
  null;

function readPersistedState(): Partial<PanelUpdateState> & { running?: boolean; finishedAt?: string | null } {
  try {
    if (fs.existsSync(statePath())) {
      return JSON.parse(fs.readFileSync(statePath(), "utf8")) as Partial<PanelUpdateState>;
    }
  } catch {
    /* ignore */
  }
  return {};
}

function readLogTail(maxLines = 20): string[] {
  const candidates = [logPath(), "/var/log/reforgerpanel-update.log"];
  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      const lines = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean);
      return lines.slice(-maxLines);
    } catch {
      /* try next */
    }
  }
  return [];
}

function inferPhase(logTail: string[]): string | null {
  const text = logTail.join("\n").toLowerCase();
  if (text.includes("restarting panel services")) return "Restarting services";
  if (text.includes("running npm run build")) return "Building Next.js (5–15 min typical)";
  if (text.includes("running npm ci")) return "Installing dependencies (npm ci)";
  if (text.includes("commit after:")) return "Pull complete — preparing build";
  if (text.includes("git pull") || text.includes("git fetch")) return "Pulling from git";
  if (text.includes("panel update started")) return "Starting update";
  return null;
}

function updateScriptRunning(): boolean {
  try {
    execFileSync("pgrep", ["-f", "update-panel.sh"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function reconcileStaleUpdate(persisted: ReturnType<typeof readPersistedState>) {
  if (persisted.running !== true || persisted.finishedAt) return persisted;
  const started = persisted.startedAt ? new Date(persisted.startedAt).getTime() : 0;
  const elapsed = started ? Date.now() - started : 0;
  if (updateScriptRunning()) return persisted;

  const logTail = readLogTail();
  const staleThreshold = logTail.length > 0 ? STALE_UPDATE_MS : STALE_NO_PROCESS_MS;
  if (elapsed < staleThreshold) return persisted;

  const finishedAt = new Date().toISOString();
  const error =
    logTail.length > 0
      ? "Update stopped unexpectedly — see log"
      : `Update did not start — check ${logPath()} and run: bash scripts/update-panel.sh`;
  const next = {
    ...persisted,
    running: false,
    ok: false,
    error,
    finishedAt,
  };
  try {
    fs.writeFileSync(statePath(), JSON.stringify(next));
  } catch {
    /* ignore */
  }
  panelUpdateRunning = false;
  return next;
}

function gitOutput(args: string[]) {
  return execFileSync("git", args, {
    cwd: agentConfig.panelRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function readGitStatus(fetch = true) {
  const now = Date.now();
  if (gitCache && now - gitCache.at < GIT_CACHE_MS) {
    return gitCache;
  }

  try {
    const branch = gitOutput(["rev-parse", "--abbrev-ref", "HEAD"]);
    const currentCommit = gitOutput(["rev-parse", "--short", "HEAD"]);
    let behindCommits = 0;
    if (fetch) {
      try {
        gitOutput(["fetch", "origin"]);
        const resolvedBranch = branch === "HEAD" ? "main" : branch;
        const remote = gitOutput(["rev-parse", "--short", `origin/${resolvedBranch}`]);
        if (remote !== currentCommit) {
          const count = gitOutput(["rev-list", "--count", `HEAD..origin/${resolvedBranch}`]);
          behindCommits = Number(count) || 0;
        }
      } catch {
        gitCache = { at: now, branch, currentCommit, behindCommits: null };
        return gitCache;
      }
    }
    gitCache = { at: now, branch, currentCommit, behindCommits };
    return gitCache;
  } catch {
    gitCache = { at: now, branch: null, currentCommit: null, behindCommits: null };
    return gitCache;
  }
}

export function getPanelUpdateStatus(): PanelUpdateState {
  const settings = getSettings();
  const persisted = reconcileStaleUpdate(readPersistedState());
  const git = readGitStatus(!persisted.running);
  const logTail = readLogTail();
  const scriptRunning = updateScriptRunning();
  const running =
    panelUpdateRunning ||
    scriptRunning ||
    (persisted.running === true && !persisted.finishedAt && persisted.ok == null);

  const startedAt = persisted.startedAt ?? null;
  const elapsedSec = startedAt ? Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000) : null;

  let error = persisted.error ?? null;
  if (error?.includes("see ") && logTail.length > 0) {
    const hint = logTail
      .slice()
      .reverse()
      .find((line) => /error|fatal|failed|denied|not found|exited/i.test(line));
    if (hint) error = hint.slice(0, 400);
  }

  return {
    running,
    ok: running ? null : (persisted.ok ?? null),
    error,
    startedAt,
    finishedAt: persisted.finishedAt ?? null,
    commitBefore: persisted.commitBefore ?? null,
    commitAfter: persisted.commitAfter ?? null,
    behindCommits: git.behindCommits,
    currentCommit: git.currentCommit,
    branch: git.branch,
    nextScheduledAt: settings.enableScheduledPanelUpdates
      ? describeNextCronRun(settings.scheduledPanelUpdateCron || "0 3 * * 0")
      : null,
    logFile: logPath(),
    logTail,
    phase: running ? inferPhase(logTail) : null,
    elapsedSec,
  };
}

export function isPanelUpdateRunning() {
  return getPanelUpdateStatus().running;
}

export function startPanelUpdate(trigger: "manual" | "scheduled") {
  if (isPanelUpdateRunning()) {
    throw new HttpError(409, "Panel update already running");
  }

  const script = path.join(agentConfig.panelRoot, "scripts/update-panel.sh");
  if (!fs.existsSync(script)) {
    throw new HttpError(500, "scripts/update-panel.sh not found — git pull once manually first");
  }

  panelUpdateRunning = true;
  gitCache = null;
  const startedAt = new Date().toISOString();
  const git = readGitStatus(true);

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

  const logFile = logPath();
  fs.mkdirSync(path.dirname(logFile), { recursive: true });

  const failStart = (message: string) => {
    const finishedAt = new Date().toISOString();
    fs.writeFileSync(
      statePath(),
      JSON.stringify({
        running: false,
        ok: false,
        error: message,
        startedAt,
        finishedAt,
        commitBefore: git.currentCommit,
        commitAfter: null,
      }),
    );
    panelUpdateRunning = false;
  };

  const child = spawn(
    "bash",
    [script, agentConfig.panelRoot],
    {
      detached: true,
      stdio: "ignore",
      cwd: agentConfig.panelRoot,
      env: {
        ...process.env,
        NODE_ENV: "development",
        PANEL_UPDATE_STATE_FILE: statePath(),
        PANEL_UPDATE_LOG_FILE: logFile,
        PANEL_USER: agentConfig.runAsUser,
      },
    },
  );

  child.on("error", (err) => {
    failStart(`Failed to start update script: ${err.message}`);
  });

  child.on("exit", (code, signal) => {
    if (code === 0 || signal) return;
    const current = readPersistedState();
    if (current.running === true && current.ok == null) {
      failStart(`Update script exited immediately (code ${code ?? "unknown"})`);
    }
  });

  child.unref();
  panelUpdateRunning = false;

  return getPanelUpdateStatus();
}

export function startPanelUpdateLoop() {
  setInterval(() => {
    const settings = getSettings();
    if (!settings.enableScheduledPanelUpdates || isPanelUpdateRunning()) return;
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

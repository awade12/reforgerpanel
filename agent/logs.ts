import fs from "fs";
import path from "path";
import { getInstance, listInstances, updateInstance, clearBotDashboardRecovery } from "./db";
import { isInstanceServiceActive, observeInstanceStatus, reconcileInstanceStatus } from "./instance-state";
import { getInstanceSystemdStatus, restartInstance } from "./systemd";
import { monitorInstanceAlerts, notifyDiscord, syncInstanceStatusEmbed } from "./alerts";

const restartWindows = new Map<string, number[]>();
const CRASH_WINDOW_MS = 10 * 60 * 1000;
const CRASH_THRESHOLD = 5;

export function tailLogFile(filePath: string, fromByte = 0): { content: string; nextByte: number } {
  if (!fs.existsSync(filePath)) return { content: "", nextByte: 0 };
  const stat = fs.statSync(filePath);
  const start = Math.min(fromByte, stat.size);
  const fd = fs.openSync(filePath, "r");
  const length = stat.size - start;
  const buffer = Buffer.alloc(length);
  fs.readSync(fd, buffer, 0, length, start);
  fs.closeSync(fd);
  return { content: buffer.toString("utf8"), nextByte: stat.size };
}

export function tailLogLines(filePath: string, lines = 30): string {
  if (!fs.existsSync(filePath)) return "";
  const content = fs.readFileSync(filePath, "utf8");
  const rows = content.split(/\r?\n/);
  return rows.slice(Math.max(0, rows.length - lines)).join("\n").trimEnd();
}

function collectLogFiles(logsDir: string): { path: string; mtimeMs: number }[] {
  const found: { path: string; mtimeMs: number }[] = [];
  if (!fs.existsSync(logsDir)) return found;

  for (const entry of fs.readdirSync(logsDir, { withFileTypes: true })) {
    const full = path.join(logsDir, entry.name);
    if (entry.isDirectory()) {
      for (const name of ["console.log", "error.log", "script.log"]) {
        const logPath = path.join(full, name);
        if (fs.existsSync(logPath)) {
          found.push({ path: logPath, mtimeMs: fs.statSync(logPath).mtimeMs });
        }
      }
      continue;
    }
    if (entry.name.endsWith(".log") || entry.name.endsWith(".txt")) {
      found.push({ path: full, mtimeMs: fs.statSync(full).mtimeMs });
    }
  }

  return found;
}

export function findLatestLogFile(profilePath: string): string | null {
  const logsDir = path.join(profilePath, "logs");
  const files = collectLogFiles(logsDir);
  const console = files.filter((f) => f.path.endsWith("/console.log")).sort((a, b) => b.mtimeMs - a.mtimeMs);
  if (console[0]) return console[0].path;
  files.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return files[0]?.path ?? null;
}

export function listLogFiles(profilePath: string): string[] {
  const logsDir = path.join(profilePath, "logs");
  return collectLogFiles(logsDir)
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .map((f) => f.path);
}

export function startMonitorLoop() {
  setInterval(async () => {
    for (const raw of listInstances()) {
      let instance = reconcileInstanceStatus(raw);
      const active = isInstanceServiceActive(instance);
      if (instance.status === "starting" && !active && getInstanceSystemdStatus(instance) !== "activating") {
        instance = updateInstance(instance.id, { status: "stopped" }) ?? { ...instance, status: "stopped" };
      }
      if (instance.status === "running" && !active) {
        const now = Date.now();
        const history = restartWindows.get(instance.id) ?? [];
        history.push(now);
        const recent = history.filter((t) => now - t < CRASH_WINDOW_MS);
        restartWindows.set(instance.id, recent);
        updateInstance(instance.id, {
          status: "crashed",
          restartCount: instance.restartCount + 1,
        });
        await notifyDiscord("crashed", instance, "Server process is no longer active", {
          restarts: recent.length,
        });
        void syncInstanceStatusEmbed(instance.id);
        if (instance.autoRestart && recent.length <= CRASH_THRESHOLD) {
          restartInstance(instance);
          updateInstance(instance.id, {
            status: "running",
            lastStartedAt: new Date().toISOString(),
          });
          await notifyDiscord("auto-restart", instance, "Auto-restarted after crash");
        } else if (recent.length > CRASH_THRESHOLD) {
          await notifyDiscord("crash-loop", instance, "Too many restarts — auto-restart paused");
        }
      }
      void monitorInstanceAlerts(instance).catch((err) => console.error("[alerts]", err));
    }
  }, 15000);
}

export function parseFpsFromLogs(profilePath: string): number | null {
  const file = findLatestLogFile(profilePath);
  if (!file) return null;
  const content = fs.readFileSync(file, "utf8").slice(-8000);
  const matches = [...content.matchAll(/FPS[:\s]+(\d+(?:\.\d+)?)/gi)];
  if (!matches.length) return null;
  return Number(matches[matches.length - 1][1]);
}

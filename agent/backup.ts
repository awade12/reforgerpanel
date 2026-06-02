import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { HttpError } from "../lib/shared/http-error";
import type { InstanceBackupMeta } from "../lib/shared/types";
import { agentConfig } from "./config";
import { addAudit, getInstance, updateInstance } from "./db";
import {
  ensureInstancePermissions,
  readInstanceConfig,
  syncSystemdUnit,
} from "./instances";
import { stopInstanceById } from "./instances";
import { reconcileInstanceStatus } from "./instance-state";
import { isActive } from "./systemd";

const BACKUP_VERSION = 1;

function backupsRoot() {
  return path.join(agentConfig.dataDir, "backups");
}

function backupDir(instanceId: string, backupId: string) {
  return path.join(backupsRoot(), instanceId, backupId);
}

function archivePath(instanceId: string, backupId: string) {
  return path.join(backupDir(instanceId, backupId), "archive.tar.gz");
}

function readManifest(instanceId: string, backupId: string) {
  const manifestPath = path.join(backupDir(instanceId, backupId), "manifest.json");
  if (!fs.existsSync(manifestPath)) return null;
  return JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function listInstanceBackups(instanceId: string): InstanceBackupMeta[] {
  const instance = getInstance(instanceId);
  if (!instance) throw new HttpError(404, "Instance not found");

  const root = path.join(backupsRoot(), instanceId);
  if (!fs.existsSync(root)) return [];

  return fs
    .readdirSync(root)
    .map((backupId) => {
      const manifest = readManifest(instanceId, backupId);
      const archive = archivePath(instanceId, backupId);
      if (!manifest || !fs.existsSync(archive)) return null;
      const stat = fs.statSync(archive);
      return {
        id: backupId,
        instanceId,
        createdAt: String(manifest.createdAt ?? backupId),
        sizeBytes: stat.size,
        sizeLabel: formatSize(stat.size),
        label: String(manifest.label ?? ""),
        includesLogs: Boolean(manifest.includesLogs),
      } satisfies InstanceBackupMeta;
    })
    .filter((item): item is InstanceBackupMeta => item != null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function createInstanceBackup(
  instanceId: string,
  opts?: { label?: string; includeLogs?: boolean },
): InstanceBackupMeta {
  const instance = getInstance(instanceId);
  if (!instance) throw new HttpError(404, "Instance not found");

  const includeLogs = opts?.includeLogs ?? false;
  const backupId = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = backupDir(instanceId, backupId);
  fs.mkdirSync(dir, { recursive: true });

  const manifest = {
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    instanceId: instance.id,
    instanceName: instance.name,
    slug: instance.slug,
    branch: instance.branch,
    label: opts?.label?.trim() ?? "",
    includesLogs: includeLogs,
    settings: {
      autoRestart: instance.autoRestart,
      maxFps: instance.maxFps,
      logStatsMs: instance.logStatsMs,
      logLevel: instance.logLevel,
    },
  };
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));

  const instanceRoot = path.dirname(instance.configPath);
  const excludes = includeLogs ? [] : ["--exclude=./profile/logs"];
  execFileSync(
    "tar",
    ["-czf", archivePath(instanceId, backupId), ...excludes, "-C", instanceRoot, "config.json", "profile", "tmp"],
    { stdio: "pipe" },
  );

  const stat = fs.statSync(archivePath(instanceId, backupId));
  addAudit("instance.backup", `${instance.slug} · ${backupId}${manifest.label ? ` · ${manifest.label}` : ""}`);

  return {
    id: backupId,
    instanceId,
    createdAt: manifest.createdAt,
    sizeBytes: stat.size,
    sizeLabel: formatSize(stat.size),
    label: manifest.label,
    includesLogs: includeLogs,
  };
}

export async function restoreInstanceBackup(instanceId: string, backupId: string) {
  const instance = getInstance(instanceId);
  if (!instance) throw new HttpError(404, "Instance not found");

  const archive = archivePath(instanceId, backupId);
  const manifest = readManifest(instanceId, backupId);
  if (!manifest || !fs.existsSync(archive)) {
    throw new HttpError(404, "Backup not found");
  }

  const live = reconcileInstanceStatus(instance);
  if (live.status === "running" || live.status === "starting" || isActive(live)) {
    await stopInstanceById(instanceId);
  }

  const instanceRoot = path.dirname(instance.configPath);
  execFileSync("tar", ["-xzf", archive, "-C", instanceRoot], { stdio: "pipe" });

  const settings = manifest.settings as Record<string, unknown> | undefined;
  if (settings) {
    updateInstance(instanceId, {
      autoRestart: settings.autoRestart as boolean | undefined,
      maxFps: settings.maxFps as number | undefined,
      logStatsMs: settings.logStatsMs as number | null | undefined,
      logLevel: settings.logLevel as string | null | undefined,
    });
  }

  const next = getInstance(instanceId)!;
  ensureInstancePermissions(next);
  syncSystemdUnit(next);
  try {
    readInstanceConfig(next);
  } catch (err) {
    throw new HttpError(500, err instanceof Error ? err.message : "Restored config is invalid");
  }

  addAudit("instance.restore", `${next.slug} · ${backupId}`);
  return listInstanceBackups(instanceId);
}

export function deleteInstanceBackup(instanceId: string, backupId: string) {
  const instance = getInstance(instanceId);
  if (!instance) throw new HttpError(404, "Instance not found");

  const dir = backupDir(instanceId, backupId);
  if (!fs.existsSync(dir)) throw new HttpError(404, "Backup not found");

  fs.rmSync(dir, { recursive: true, force: true });
  addAudit("instance.backup.delete", `${instance.slug} · ${backupId}`);
  return { ok: true };
}

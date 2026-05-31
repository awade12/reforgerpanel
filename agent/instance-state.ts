import type { InstanceRecord, InstanceStatus } from "../lib/shared/types";
import { clearBotDashboardRecovery, updateInstance } from "./db";
import { getInstanceSystemdStatus } from "./systemd";

const runtimeCache = new Map<string, { at: number; meta: import("../lib/shared/types").RuntimeMeta }>();

export function invalidateRuntimeCache(instanceId: string) {
  runtimeCache.delete(instanceId);
}

export function readRuntimeCache(instanceId: string) {
  return runtimeCache.get(instanceId) ?? null;
}

export function writeRuntimeCache(instanceId: string, meta: import("../lib/shared/types").RuntimeMeta) {
  runtimeCache.set(instanceId, { at: Date.now(), meta });
}

export const RUNTIME_CACHE_MS = 10_000;

const STUCK_STARTING_MS = 3 * 60 * 1000;

function systemdToStatus(systemd: string, current: InstanceStatus): InstanceStatus {
  if (systemd === "active") return "running";
  if (systemd === "activating") return "starting";
  if (systemd === "deactivating") return "stopping";
  if (systemd === "failed") return "crashed";
  if (current === "crashed") return "crashed";
  return "stopped";
}

function isStuckStarting(instance: InstanceRecord, systemd: string): boolean {
  if (instance.status !== "starting" || systemd === "active" || systemd === "activating") {
    return false;
  }
  const anchor = instance.lastStartedAt ?? instance.updatedAt;
  if (!anchor) return true;
  return Date.now() - new Date(anchor).getTime() > STUCK_STARTING_MS;
}

export function reconcileInstanceStatus(instance: InstanceRecord): InstanceRecord {
  const systemd = getInstanceSystemdStatus(instance);
  let next = systemdToStatus(systemd, instance.status);
  if (isStuckStarting(instance, systemd)) {
    next = systemd === "failed" ? "crashed" : "stopped";
  }
  if (instance.status === next) return instance;

  invalidateRuntimeCache(instance.id);
  const patch: Partial<InstanceRecord> = { status: next };
  if (next === "running" && !instance.lastStartedAt) {
    patch.lastStartedAt = new Date().toISOString();
  }
  if (next === "running") {
    clearBotDashboardRecovery(instance.id);
  }
  return updateInstance(instance.id, patch) ?? { ...instance, status: next };
}

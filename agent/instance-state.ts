import type { InstanceRecord, InstanceStatus } from "../lib/shared/types";
import { clearBotDashboardRecovery, updateInstance } from "./db";
import { getInstanceSystemdStatus } from "./systemd";

const runtimeCache = new Map<string, { at: number; meta: import("../lib/shared/types").RuntimeMeta }>();
const downgradeStreak = new Map<string, number>();

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
const LIVE_SYSTEMD = new Set(["active", "activating", "deactivating"]);

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

export function probeSystemdStatus(instance: InstanceRecord): string {
  const first = getInstanceSystemdStatus(instance);
  if (instance.status !== "running" && instance.status !== "starting") return first;
  if (LIVE_SYSTEMD.has(first)) return first;

  for (let i = 0; i < 2; i++) {
    const again = getInstanceSystemdStatus(instance);
    if (LIVE_SYSTEMD.has(again)) return again;
    if (again && again !== first) return again;
  }
  return first;
}

export function isInstanceServiceActive(instance: InstanceRecord): boolean {
  return probeSystemdStatus(instance) === "active";
}

function isStatusDowngrade(from: InstanceStatus, to: InstanceStatus): boolean {
  if (from === "running" && (to === "stopped" || to === "crashed")) return true;
  if (from === "starting" && to === "stopped") return true;
  return false;
}

function resolveInstanceStatus(instance: InstanceRecord): InstanceRecord {
  const systemd = probeSystemdStatus(instance);
  let next = systemdToStatus(systemd, instance.status);
  if (isStuckStarting(instance, systemd)) {
    next = systemd === "failed" ? "crashed" : "stopped";
  }
  if (instance.status === next) return instance;
  return { ...instance, status: next };
}

export function observeInstanceStatus(instance: InstanceRecord): InstanceRecord {
  return resolveInstanceStatus(instance);
}

export function reconcileInstanceStatus(instance: InstanceRecord): InstanceRecord {
  const resolved = resolveInstanceStatus(instance);
  if (resolved.status === instance.status) {
    downgradeStreak.delete(instance.id);
    return instance;
  }

  if (isStatusDowngrade(instance.status, resolved.status)) {
    const streak = (downgradeStreak.get(instance.id) ?? 0) + 1;
    downgradeStreak.set(instance.id, streak);
    if (streak < 2) return instance;
  } else {
    downgradeStreak.delete(instance.id);
  }

  invalidateRuntimeCache(instance.id);
  const patch: Partial<InstanceRecord> = { status: resolved.status };
  if (resolved.status === "running" && !instance.lastStartedAt) {
    patch.lastStartedAt = new Date().toISOString();
  }
  if (resolved.status === "running") {
    clearBotDashboardRecovery(instance.id);
  }
  return updateInstance(instance.id, patch) ?? resolved;
}

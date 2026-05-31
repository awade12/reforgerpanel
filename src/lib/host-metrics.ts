import type { HostInfo } from "@/lib/shared/types";

export const METRICS_POLL_MS = 5000;
export const METRICS_HISTORY_LIMIT = 120;

export type MetricsSample = {
  at: string;
  cpu: number;
  memory: number;
  players: number;
  instanceRam: number;
  load1: number;
  load5: number;
  load15: number;
  diskFreeGb: number;
};

export type InstanceMetrics = {
  id: string;
  name: string;
  status: string;
  lastKnownPlayerCount: number | null;
  config: { publicPort: number; game: { maxPlayers: number } };
  runtime?: {
    memoryMb?: number;
    uptimeSec?: number;
    systemdActive?: boolean;
    diskUsageMb?: number;
  };
};

export function pushMetricsSample(samples: MetricsSample[], next: MetricsSample, limit = METRICS_HISTORY_LIMIT) {
  const merged = [...samples, next];
  return merged.length > limit ? merged.slice(-limit) : merged;
}

export function cpuPercent(host: HostInfo) {
  const cores = host.cpuCount ?? 1;
  const load = host.loadAvg?.[0] ?? 0;
  return Math.min(100, Math.round((load / cores) * 100));
}

export function memoryPercent(host: HostInfo) {
  if (!host.memoryTotalMb) return 0;
  return Math.round(((host.memoryUsedMb ?? 0) / host.memoryTotalMb) * 100);
}

export function diskUsedPercent(host: HostInfo) {
  if (!host.diskTotalGb) return null;
  const used = host.diskTotalGb - host.diskFreeGb;
  return Math.round((used / host.diskTotalGb) * 100);
}

export function gameRamMb(host: HostInfo, instances: InstanceMetrics[]) {
  if (host.instanceRamMb != null && host.instanceRamMb > 0) return host.instanceRamMb;
  return instances.reduce((sum, instance) => {
    if (!instance.runtime?.systemdActive && instance.status !== "running") return sum;
    return sum + (instance.runtime?.memoryMb ?? 0);
  }, 0);
}

export function runningCount(host: HostInfo, instances: InstanceMetrics[]) {
  if (host.instancesRunning != null && host.instancesTotal != null) {
    return { running: host.instancesRunning, total: host.instancesTotal };
  }
  const running = instances.filter(
    (instance) => instance.runtime?.systemdActive || instance.status === "running",
  ).length;
  return { running, total: instances.length };
}

export function sampleFromHost(host: HostInfo, instances: InstanceMetrics[]): MetricsSample {
  const time = new Date();
  return {
    at: time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    cpu: cpuPercent(host),
    memory: memoryPercent(host),
    players: host.playersOnline ?? instances.reduce((sum, i) => sum + (i.lastKnownPlayerCount ?? 0), 0),
    instanceRam: gameRamMb(host, instances),
    load1: host.loadAvg?.[0] ?? 0,
    load5: host.loadAvg?.[1] ?? 0,
    load15: host.loadAvg?.[2] ?? 0,
    diskFreeGb: host.diskFreeGb,
  };
}

export function formatRuntime(sec?: number) {
  if (sec == null) return "—";
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

import type { InstanceMetricSample } from "../lib/shared/types";
import { getNetworkRates, sampleNetworkRatesForStorage } from "./network-stats";
import { queryInstanceA2s } from "./a2s";
import { listInstances } from "./db";
import {
  insertHostSample,
  insertInstanceEvent,
  insertInstanceSamples,
  metricsEnabled,
  pruneOldMetrics,
} from "./db/metrics";
import { getHostInfo, getRuntimeMeta, readInstanceConfig } from "./instances";
import { reconcileInstanceStatus } from "./instance-state";
import { parseFpsFromLogs } from "./logs";

const COLLECT_INTERVAL_MS = 15_000;
const A2S_EVERY_N_TICKS = 2;
const PRUNE_EVERY_N_TICKS = 240;

let tick = 0;
let lastStatus = new Map<string, string>();

function hostMemoryPercent(host: ReturnType<typeof getHostInfo>) {
  if (!host.memoryTotalMb) return null;
  return Math.round(((host.memoryUsedMb ?? 0) / host.memoryTotalMb) * 100);
}

function hostCpuPercent(host: ReturnType<typeof getHostInfo>) {
  const cores = host.cpuCount ?? 1;
  const load = host.loadAvg?.[0] ?? 0;
  return Math.min(100, Math.round((load / cores) * 100));
}

function diskUsedPercent(host: ReturnType<typeof getHostInfo>) {
  if (!host.diskTotalGb) return null;
  const used = host.diskTotalGb - host.diskFreeGb;
  return Math.round((used / host.diskTotalGb) * 100);
}

async function collectTick() {
  if (!metricsEnabled()) return;
  tick += 1;
  const now = new Date().toISOString();
  const host = getHostInfo();
  const memPct = hostMemoryPercent(host);
  const cpuPct = hostCpuPercent(host);
  const network = sampleNetworkRatesForStorage();

  await insertHostSample({
    at: now,
    cpuPercent: cpuPct,
    memoryPercent: memPct,
    memoryUsedMb: host.memoryUsedMb ?? null,
    memoryTotalMb: host.memoryTotalMb ?? null,
    load1: host.loadAvg?.[0] ?? null,
    load5: host.loadAvg?.[1] ?? null,
    load15: host.loadAvg?.[2] ?? null,
    diskFreeGb: host.diskFreeGb,
    diskUsedPercent: diskUsedPercent(host),
    playersOnline: host.playersOnline ?? null,
    instancesRunning: host.instancesRunning ?? null,
    instancesTotal: host.instancesTotal ?? null,
    instanceRamMb: host.instanceRamMb ?? null,
    ingressMbps: network?.ingressMbps ?? null,
    egressMbps: network?.egressMbps ?? null,
    networkIface: network?.interface ?? host.networkInterface ?? null,
  });

  const queryA2s = tick % A2S_EVERY_N_TICKS === 0;
  const samples: InstanceMetricSample[] = [];

  for (const raw of listInstances()) {
    const instance = reconcileInstanceStatus(raw);
    const runtime = getRuntimeMeta(instance);
    let playerCount = instance.lastKnownPlayerCount;
    let maxPlayers: number | null = null;
    let a2sListed: boolean | null = null;
    let a2sLatencyMs: number | null = null;
    let fps: number | null = null;

    if (instance.status === "running" || instance.status === "starting") {
      fps = parseFpsFromLogs(instance.profilePath);
      if (queryA2s) {
        try {
          const config = readInstanceConfig(instance);
          maxPlayers = config.game.maxPlayers;
          const a2s = await queryInstanceA2s(instance);
          a2sListed = a2s.listed;
          a2sLatencyMs = a2s.latencyMs;
          if (a2s.players != null) playerCount = a2s.players;
        } catch {
          /* ignore a2s errors */
        }
      }
    }

    samples.push({
      at: now,
      instanceId: instance.id,
      status: instance.status,
      fps,
      memoryMb: runtime.memoryMb ?? null,
      cpuPercent: runtime.cpuPercent ?? null,
      playerCount,
      maxPlayers,
      a2sListed,
      a2sLatencyMs,
      diskProfileMb: runtime.diskUsageMb ?? null,
      systemdActive: runtime.systemdActive ?? null,
      uptimeSec: runtime.uptimeSec ?? null,
      hostLoad1: host.loadAvg?.[0] ?? null,
      hostMemoryPercent: memPct,
    });

    const prev = lastStatus.get(instance.id);
    if (prev && prev !== instance.status) {
      await insertInstanceEvent({
        at: now,
        instanceId: instance.id,
        kind: `status:${instance.status}`,
        payload: { from: prev, to: instance.status },
      });
    }
    lastStatus.set(instance.id, instance.status);
  }

  await insertInstanceSamples(samples);

  if (tick % PRUNE_EVERY_N_TICKS === 0) {
    void pruneOldMetrics().catch((err) => console.error("[metrics] prune failed:", err));
  }
}

export function startMetricsCollector() {
  if (!metricsEnabled()) {
    console.log("[metrics] PostgreSQL not configured — metrics storage disabled");
    return;
  }
  console.log("[metrics] Collecting every 15s · 30-day retention");
  void collectTick().catch((err) => console.error("[metrics] collect failed:", err));
  setInterval(() => {
    void collectTick().catch((err) => console.error("[metrics] collect failed:", err));
  }, COLLECT_INTERVAL_MS);
}

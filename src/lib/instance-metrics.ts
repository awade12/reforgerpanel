import type {
  HostMetricSample,
  InstanceMetricEvent,
  InstanceMetricSample,
  MetricsResolution,
  MetricsSummary,
  MetricsTimeRange,
} from "@/lib/shared/types";

export const METRICS_LIVE_POLL_MS = 5000;

export type MetricsWindow = {
  range: MetricsTimeRange;
  resolution: MetricsResolution;
  from: string;
  to: string;
};

export type HostMetricsResponse = MetricsWindow & {
  enabled: boolean;
  samples: HostMetricSample[];
  latest: HostMetricSample | null;
  rawSampleCount: number;
};

export type InstanceMetricsResponse = MetricsWindow & {
  enabled: boolean;
  samples: InstanceMetricSample[];
  latest: InstanceMetricSample | null;
  rawSampleCount: number;
};

export type InstanceEventsResponse = MetricsWindow & {
  enabled: boolean;
  events: InstanceMetricEvent[];
};

export const TIME_RANGES: { value: MetricsTimeRange; label: string }[] = [
  { value: "1h", label: "1 hour" },
  { value: "6h", label: "6 hours" },
  { value: "24h", label: "24 hours" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
];

const RESOLUTION_LABELS: Record<MetricsResolution, string> = {
  raw: "each measurement (~15s)",
  "1m": "every minute",
  "5m": "every 5 minutes",
  "1h": "every hour",
};

export function formatGraphLabel(range: MetricsTimeRange, chartPoints: number): string {
  const rangeLabel = TIME_RANGES.find((r) => r.value === range)?.label ?? range;
  return `${rangeLabel} · ${chartPoints.toLocaleString()} points`;
}

export function graphLabelTooltip(opts: {
  chartPoints: number;
  rawCount?: number;
  resolution?: MetricsResolution;
}): string {
  const raw = opts.rawCount ?? opts.chartPoints;
  const interval = opts.resolution ? RESOLUTION_LABELS[opts.resolution] : null;
  if (interval && raw > opts.chartPoints) {
    return `Each point is averaged ${interval}. The graph uses ${opts.chartPoints.toLocaleString()} points from ${raw.toLocaleString()} measurements taken every ~15 seconds.`;
  }
  if (interval) {
    return `Each point is averaged ${interval}. Measurements are taken every ~15 seconds.`;
  }
  if (raw > opts.chartPoints) {
    return `${opts.chartPoints.toLocaleString()} points on the graph, from ${raw.toLocaleString()} measurements taken every ~15 seconds.`;
  }
  return "Measurements are taken every ~15 seconds.";
}

export function formatStoredLabel(hostSamples: number, instanceSamples: number, retentionDays: number): string {
  return `${hostSamples.toLocaleString()} · ${instanceSamples.toLocaleString()} · ${retentionDays}d`;
}

export function storedHistoryTooltip(hostSamples: number, instanceSamples: number, retentionDays: number): string {
  return `${hostSamples.toLocaleString()} server readings (CPU, RAM, network) and ${instanceSamples.toLocaleString()} game-server readings (FPS, players, memory). Data older than ${retentionDays} days is removed automatically.`;
}

export function metricsQuery(range: MetricsTimeRange, resolution?: MetricsResolution) {
  const params = new URLSearchParams({ range });
  if (resolution) params.set("resolution", resolution);
  return params.toString();
}

export function formatSampleTime(iso: string, range: MetricsTimeRange) {
  const date = new Date(iso);
  if (range === "7d" || range === "30d") {
    return date.toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function hostSampleToChart(sample: HostMetricSample, range: MetricsTimeRange) {
  return {
    at: formatSampleTime(sample.at, range),
    cpu: sample.cpuPercent ?? 0,
    memory: sample.memoryPercent ?? 0,
    players: sample.playersOnline ?? 0,
    instanceRam: sample.instanceRamMb ?? 0,
    load1: sample.load1 ?? 0,
    load5: sample.load5 ?? 0,
    load15: sample.load15 ?? 0,
    diskFreeGb: sample.diskFreeGb ?? 0,
    ingressMbps: sample.ingressMbps ?? 0,
    egressMbps: sample.egressMbps ?? 0,
  };
}

export function instanceSampleToChart(sample: InstanceMetricSample, range: MetricsTimeRange) {
  return {
    at: formatSampleTime(sample.at, range),
    fps: sample.fps ?? 0,
    memoryMb: sample.memoryMb ?? 0,
    players: sample.playerCount ?? 0,
    a2sLatencyMs: sample.a2sLatencyMs ?? 0,
    diskProfileMb: sample.diskProfileMb ?? 0,
    uptimeSec: sample.uptimeSec ?? 0,
    hostLoad1: sample.hostLoad1 ?? 0,
    hostMemory: sample.hostMemoryPercent ?? 0,
  };
}

export function formatEventKind(kind: string) {
  if (kind.startsWith("status:")) return `Status → ${kind.slice(7)}`;
  return kind;
}

export type MetricsStatusResponse = MetricsSummary;

export type InstancesOverviewResponse = MetricsWindow & {
  enabled: boolean;
  instances: import("@/lib/shared/types").InstanceMetricsOverviewItem[];
};

function avg(values: number[]) {
  if (!values.length) return null;
  return Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 10) / 10;
}

function max(values: number[]) {
  return values.length ? Math.max(...values) : null;
}

export function computeHostStats(samples: HostMetricSample[]) {
  if (!samples.length) return null;
  const cpu = samples.map((s) => s.cpuPercent).filter((v): v is number => v != null);
  const memory = samples.map((s) => s.memoryPercent).filter((v): v is number => v != null);
  const players = samples.map((s) => s.playersOnline).filter((v): v is number => v != null);
  const gameRam = samples.map((s) => s.instanceRamMb).filter((v): v is number => v != null);
  const load1 = samples.map((s) => s.load1).filter((v): v is number => v != null);
  const ingress = samples.map((s) => s.ingressMbps).filter((v): v is number => v != null);
  const egress = samples.map((s) => s.egressMbps).filter((v): v is number => v != null);
  return {
    avgCpu: avg(cpu),
    peakCpu: max(cpu),
    avgMemory: avg(memory),
    peakMemory: max(memory),
    peakPlayers: max(players),
    peakGameRam: max(gameRam),
    avgLoad1: avg(load1),
    peakIngress: max(ingress),
    peakEgress: max(egress),
    avgIngress: avg(ingress),
    avgEgress: avg(egress),
  };
}

export function formatDelta(current: number | null, previous: number | null, suffix = "") {
  if (current == null || previous == null || previous === 0) return undefined;
  const diff = current - previous;
  const pct = Math.round((diff / previous) * 100);
  if (pct === 0) return "flat vs start";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct}% vs start${suffix}`;
}

export function sparklineToChart(
  points: import("@/lib/shared/types").InstanceMetricsSparkPoint[],
  range: MetricsTimeRange,
  dataKey: "fps" | "memoryMb" | "players",
) {
  return points.map((point) => ({
    at: formatSampleTime(point.at, range),
    fps: point.fps ?? 0,
    memoryMb: point.memoryMb ?? 0,
    players: point.players ?? 0,
    [dataKey]: point[dataKey] ?? 0,
  }));
}

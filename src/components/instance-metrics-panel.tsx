"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { InstanceMetricSample, MetricsTimeRange } from "@/lib/shared/types";
import {
  METRICS_LIVE_POLL_MS,
  TIME_RANGES,
  formatDelta,
  formatEventKind,
  formatGraphLabel,
  graphLabelTooltip,
  formatSampleTime,
  instanceSampleToChart,
  metricsQuery,
  type InstanceEventsResponse,
  type InstanceMetricsResponse,
} from "@/lib/instance-metrics";
import { MetricsInlineHint } from "@/components/metrics-stat-hint";
import { formatRuntime } from "@/lib/host-metrics";
import { MetricsAreaChart, MetricsStatTile } from "@/components/metrics-chart";
import { api, Card, StatusBadge } from "@/components/Shell";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function latestValue(sample: InstanceMetricSample | null, key: keyof InstanceMetricSample, suffix = "") {
  const value = sample?.[key];
  if (value == null || value === "") return "—";
  return `${value}${suffix}`;
}

function computeInstanceStats(samples: InstanceMetricSample[]) {
  const fps = samples.map((s) => s.fps).filter((v): v is number => v != null);
  const memory = samples.map((s) => s.memoryMb).filter((v): v is number => v != null);
  const players = samples.map((s) => s.playerCount).filter((v): v is number => v != null);
  const avg = (values: number[]) =>
    values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : null;
  const max = (values: number[]) => (values.length ? Math.max(...values) : null);
  return {
    avgFps: avg(fps),
    minFps: fps.length ? Math.min(...fps) : null,
    maxFps: max(fps),
    avgMemory: avg(memory),
    peakMemory: max(memory),
    peakPlayers: max(players),
    avgPlayers: avg(players),
  };
}

export function InstanceMetricsPanel({
  instanceId,
  instanceName,
  instanceStatus,
  maxPlayers,
}: {
  instanceId: string;
  instanceName: string;
  instanceStatus: string;
  maxPlayers: number;
}) {
  const [range, setRange] = useState<MetricsTimeRange>("24h");
  const [data, setData] = useState<InstanceMetricsResponse | null>(null);
  const [events, setEvents] = useState<InstanceEventsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const loadHistory = useCallback(async () => {
    try {
      const [metrics, eventData] = await Promise.all([
        api<InstanceMetricsResponse>(`instances/${instanceId}/metrics?${metricsQuery(range)}`),
        api<InstanceEventsResponse>(`instances/${instanceId}/metrics/events?${metricsQuery(range)}`).catch(() => null),
      ]);
      setData(metrics);
      setEvents(eventData);
    } catch {
      /* keep last data */
    } finally {
      setLoading(false);
    }
  }, [instanceId, range]);

  useEffect(() => {
    setLoading(true);
    void loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    let active = true;
    async function pollLatest() {
      try {
        const latest = await api<{ enabled: boolean; sample: InstanceMetricSample | null }>(
          `instances/${instanceId}/metrics/latest`,
        );
        if (!active || !latest.enabled || !latest.sample) return;
        setData((current) => {
          if (!current?.enabled) return current;
          const samples = [...current.samples];
          const last = samples[samples.length - 1];
          if (last?.at === latest.sample!.at) {
            samples[samples.length - 1] = latest.sample!;
          } else {
            samples.push(latest.sample!);
          }
          return { ...current, latest: latest.sample, samples };
        });
      } catch {
        /* ignore */
      }
    }
    const timer = setInterval(() => void pollLatest(), METRICS_LIVE_POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [instanceId]);

  const chartData = useMemo(
    () => (data?.samples ?? []).map((sample) => instanceSampleToChart(sample, range)),
    [data?.samples, range],
  );
  const latest = data?.latest ?? data?.samples[data?.samples.length - 1] ?? null;
  const first = data?.samples[0] ?? null;
  const stats = useMemo(() => computeInstanceStats(data?.samples ?? []), [data?.samples]);

  if (!data?.enabled) {
    return (
      <Card className="px-4 py-6">
        <p className="text-sm text-muted-foreground">
          PostgreSQL metrics storage is not enabled. Set <code className="font-mono text-xs">DATABASE_URL</code> on the
          agent to track metrics over time.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-medium text-foreground">{instanceName}</h2>
              <StatusBadge status={instanceStatus} />
            </div>
            <div className="mt-1">
              <MetricsInlineHint
                value={formatGraphLabel(range, data.samples.length)}
                tip={graphLabelTooltip({
                  chartPoints: data.samples.length,
                  rawCount: data.rawSampleCount,
                  resolution: data.resolution,
                })}
              />
            </div>
          </div>
          <Select value={range} onValueChange={(v) => setRange(v as MetricsTimeRange)}>
            <SelectTrigger className="h-8 w-[132px] font-mono text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIME_RANGES.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {loading && !chartData.length ? (
        <p className="text-sm text-muted-foreground">Loading historical metrics…</p>
      ) : chartData.length === 0 ? (
        <Card className="px-4 py-6">
          <p className="text-sm text-muted-foreground">
            No history yet. The agent records metrics every 15 seconds when PostgreSQL is configured.
          </p>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricsStatTile
              label="Avg FPS"
              value={stats.avgFps != null ? String(Math.round(stats.avgFps)) : "—"}
              sub={stats.minFps != null && stats.maxFps != null ? `${Math.round(stats.minFps)}–${Math.round(stats.maxFps)} range` : undefined}
            />
            <MetricsStatTile
              label="Peak players"
              value={stats.peakPlayers != null ? String(stats.peakPlayers) : "—"}
              sub={stats.avgPlayers != null ? `Avg ${stats.avgPlayers}` : undefined}
            />
            <MetricsStatTile
              label="Avg memory"
              value={stats.avgMemory != null ? `${Math.round(stats.avgMemory)} MB` : "—"}
              sub={stats.peakMemory != null ? `Peak ${stats.peakMemory} MB` : undefined}
            />
            <MetricsStatTile
              label="Last sample"
              value={latest ? formatSampleTime(latest.at, range) : "—"}
              sub={latest?.a2sListed ? "A2S listed" : latest?.a2sListed === false ? "Not on A2S" : undefined}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <MetricsAreaChart
              title="FPS"
              value={latestValue(latest, "fps")}
              hint={latest?.fps != null ? "Parsed from server logs" : undefined}
              delta={formatDelta(latest?.fps ?? null, first?.fps ?? null)}
              dataKey="fps"
              color="#7eb0d4"
              data={chartData}
            />
            <MetricsAreaChart
              title="Players"
              value={
                latest?.playerCount != null
                  ? `${latest.playerCount}/${latest.maxPlayers ?? maxPlayers}`
                  : "—"
              }
              hint={latest?.a2sListed ? "A2S listed" : latest?.a2sListed === false ? "Not listed on A2S" : undefined}
              delta={formatDelta(latest?.playerCount ?? null, first?.playerCount ?? null)}
              dataKey="players"
              color="#8b9fd4"
              data={chartData}
            />
            <MetricsAreaChart
              title="Memory"
              value={latestValue(latest, "memoryMb", " MB")}
              delta={formatDelta(latest?.memoryMb ?? null, first?.memoryMb ?? null, " MB")}
              dataKey="memoryMb"
              color="#6a9ab8"
              suffix=" MB"
              data={chartData}
            />
            <MetricsAreaChart
              title="A2S latency"
              value={latestValue(latest, "a2sLatencyMs", " ms")}
              dataKey="a2sLatencyMs"
              color="#a8b4c8"
              suffix=" ms"
              data={chartData}
            />
            <MetricsAreaChart
              title="Profile disk"
              value={latestValue(latest, "diskProfileMb", " MB")}
              dataKey="diskProfileMb"
              color="#5c8fad"
              suffix=" MB"
              data={chartData}
            />
            <MetricsAreaChart
              title="Host load (1m)"
              value={latest?.hostLoad1 != null ? latest.hostLoad1.toFixed(2) : "—"}
              hint={
                latest?.hostMemoryPercent != null
                  ? `Host memory ${latest.hostMemoryPercent}% at sample time`
                  : undefined
              }
              dataKey="hostLoad1"
              color="#7eb0d4"
              data={chartData}
            />
          </div>

          <Card className="overflow-hidden">
            <div className="border-b border-border px-4 py-3">
              <h3 className="text-sm font-medium text-foreground">Current snapshot</h3>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4">
              <div className="border-b border-r border-border px-4 py-3">
                <p className="font-mono text-[10px] uppercase text-muted-foreground">Status</p>
                <p className="mt-1 text-sm text-foreground">{latest?.status ?? instanceStatus}</p>
              </div>
              <div className="border-b border-border px-4 py-3 lg:border-r">
                <p className="font-mono text-[10px] uppercase text-muted-foreground">Uptime</p>
                <p className="mt-1 text-sm text-foreground">{formatRuntime(latest?.uptimeSec ?? undefined)}</p>
              </div>
              <div className="border-b border-r border-border px-4 py-3">
                <p className="font-mono text-[10px] uppercase text-muted-foreground">Systemd</p>
                <p className="mt-1 text-sm text-foreground">{latest?.systemdActive ? "Active" : "Inactive"}</p>
              </div>
              <div className="border-b border-border px-4 py-3">
                <p className="font-mono text-[10px] uppercase text-muted-foreground">A2S latency</p>
                <p className="mt-1 text-sm text-foreground">
                  {latest?.a2sLatencyMs != null ? `${latest.a2sLatencyMs} ms` : "—"}
                </p>
              </div>
            </div>
          </Card>
        </>
      )}

      {events?.enabled && events.events.length > 0 && (
        <Card className="overflow-hidden">
          <div className="border-b border-border px-4 py-3">
            <h3 className="text-sm font-medium text-foreground">Events</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">Status changes and notable transitions.</p>
          </div>
          <div className="divide-y divide-border">
            {events.events.map((event) => (
              <div key={event.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <p className="text-sm text-foreground">{formatEventKind(event.kind)}</p>
                <p className="font-mono text-[11px] text-muted-foreground">
                  {formatSampleTime(event.at, range)}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

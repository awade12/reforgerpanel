"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { GameInstallStatus, HostInfo, InstanceMetricsOverviewItem, MetricsTimeRange } from "@/lib/shared/types";
import {
  METRICS_POLL_MS,
  type InstanceMetrics,
  type MetricsSample,
  cpuPercent,
  diskUsedPercent,
  formatRuntime,
  formatBandwidth,
  gameRamMb,
  memoryPercent,
  pushMetricsSample,
  runningCount,
  sampleFromHost,
} from "@/lib/host-metrics";
import {
  METRICS_LIVE_POLL_MS,
  TIME_RANGES,
  computeHostStats,
  formatDelta,
  hostSampleToChart,
  metricsQuery,
  sparklineToChart,
  type HostMetricsResponse,
  type InstancesOverviewResponse,
} from "@/lib/instance-metrics";
import { MetricsAreaChart, MetricsMultiLineChart, MetricsSparkline, MetricsStatTile } from "@/components/metrics-chart";
import { Card, Stat, api, StatusBadge } from "@/components/Shell";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const HISTORY_REFRESH_MS = 30_000;

export function HostMetricsPanel({
  initial,
  game,
  instances = [],
  postgresEnabled = false,
  onSelectInstance,
}: {
  initial: HostInfo | null;
  game: GameInstallStatus | null;
  instances?: InstanceMetrics[];
  postgresEnabled?: boolean;
  onSelectInstance?: (id: string) => void;
}) {
  const [host, setHost] = useState<HostInfo | null>(initial);
  const [range, setRange] = useState<MetricsTimeRange>("24h");
  const [history, setHistory] = useState<MetricsSample[]>(() =>
    initial ? [sampleFromHost(initial, instances)] : [],
  );
  const [postgresHistory, setPostgresHistory] = useState<HostMetricsResponse | null>(null);
  const [overview, setOverview] = useState<InstancesOverviewResponse | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [loadError, setLoadError] = useState("");

  const loadStored = useCallback(async () => {
    if (!postgresEnabled) return;
    setLoadError("");
    try {
      const hostData = await api<HostMetricsResponse>(`metrics/host?${metricsQuery(range)}`);
      setPostgresHistory(hostData);
      setLastRefresh(new Date());
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load stored host metrics");
    }
    try {
      const instanceData = await api<InstancesOverviewResponse>(
        `metrics/instances/overview?${metricsQuery(range)}`,
      );
      setOverview(instanceData);
    } catch {
      /* overview is optional */
    }
  }, [postgresEnabled, range]);

  useEffect(() => {
    void loadStored();
  }, [loadStored]);

  useEffect(() => {
    if (!postgresEnabled) return;
    const timer = setInterval(() => void loadStored(), HISTORY_REFRESH_MS);
    return () => clearInterval(timer);
  }, [loadStored, postgresEnabled]);

  useEffect(() => {
    if (initial) {
      setHost(initial);
      setHistory((current) =>
        pushMetricsSample(current.length ? current : [], sampleFromHost(initial, instances)),
      );
    }
  }, [initial, instances]);

  useEffect(() => {
    let active = true;

    async function poll() {
      try {
        const [nextHost, nextInstances] = await Promise.all([
          api<HostInfo>("host"),
          api<InstanceMetrics[]>("instances").catch(() => instances),
        ]);
        if (!active) return;
        setHost(nextHost);
        setHistory((current) =>
          pushMetricsSample(current, sampleFromHost(nextHost, nextInstances ?? instances)),
        );
      } catch {
        /* keep last sample */
      }
    }

    const timer = setInterval(() => void poll(), postgresEnabled ? METRICS_LIVE_POLL_MS : METRICS_POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [instances, postgresEnabled]);

  const chartData = useMemo(() => {
    if (postgresEnabled && postgresHistory?.enabled && postgresHistory.samples.length) {
      return postgresHistory.samples.map((sample) => hostSampleToChart(sample, range));
    }
    return history;
  }, [postgresEnabled, postgresHistory, history, range]);

  const liveLatest = history[history.length - 1];

  const hostStats = useMemo(
    () => (postgresHistory?.samples ? computeHostStats(postgresHistory.samples) : null),
    [postgresHistory?.samples],
  );

  const overviewById = useMemo(() => {
    const map = new Map<string, InstanceMetricsOverviewItem>();
    for (const item of overview?.instances ?? []) map.set(item.instanceId, item);
    return map;
  }, [overview?.instances]);

  const latest = chartData[chartData.length - 1];
  const first = chartData[0];
  const counts = runningCount(host ?? initial ?? ({} as HostInfo), instances);
  const liveGameRam = gameRamMb(host ?? initial ?? ({} as HostInfo), instances);
  const gameRamPct =
    host?.memoryTotalMb && liveGameRam > 0
      ? Math.round((liveGameRam / host.memoryTotalMb) * 100)
      : null;
  const diskPct = host ? diskUsedPercent(host) : null;

  if (!host || !latest) {
    return <p className="text-sm text-muted-foreground">Loading metrics…</p>;
  }

  const memPct = memoryPercent(host);

  return (
    <div className="space-y-8">
      {loadError && (
        <div className="border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Stored metrics unavailable — showing live data. {loadError}
        </div>
      )}
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="font-mono text-[11px] text-muted-foreground">Host</p>
            <h2 className="mt-0.5 text-sm font-medium text-foreground">
              {host.hostname || "—"}
              <span className="font-normal text-muted-foreground">
                {" "}
                · {host.publicIpHint || host.ips[0] || "—"}
              </span>
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {host.uptimeLabel ?? "—"} uptime
              {postgresEnabled && chartData.length > 0 && (
                <>
                  {" "}
                  · {TIME_RANGES.find((r) => r.value === range)?.label ?? range} charts (
                  {chartData.length} points)
                </>
              )}
              {!postgresEnabled && <> · live sampling</>}
              {lastRefresh && (
                <>
                  {" "}
                  · refreshed{" "}
                  {lastRefresh.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </>
              )}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {postgresEnabled && (
              <Select value={range} onValueChange={(v) => setRange(v as MetricsTimeRange)}>
                <SelectTrigger className="h-8 w-[128px] text-xs">
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
            )}
            <span className="inline-flex items-center gap-1.5 border border-chart-1/40 bg-chart-1/10 px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-chart-1">
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex size-full animate-ping bg-chart-1/60" />
                <span className="relative size-1.5 bg-chart-1" />
              </span>
              Live
            </span>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-5">
          <Stat
            label="CPU"
            value={`${liveLatest?.cpu ?? cpuPercent(host)}%`}
            hint={`${host.cpuCount ?? "?"} cores · load ${host.loadAvg?.[0]?.toFixed(2) ?? "—"}`}
          />
          <Stat
            label="Memory"
            value={`${memPct}%`}
            hint={`${host.memoryUsedMb ?? 0} / ${host.memoryTotalMb ?? 0} MB · ${host.memoryFreeMb ?? 0} MB free`}
          />
          <Stat
            label="Load avg"
            value={host.loadAvg ? host.loadAvg[0].toFixed(2) : "—"}
            hint={
              host.loadAvg
                ? `1m · 5m · 15m: ${host.loadAvg.map((v) => v.toFixed(2)).join(" · ")}`
                : undefined
            }
          />
          <Stat
            label="Network"
            value={`↓ ${formatBandwidth(host.networkIngressMbps)}`}
            hint={`↑ ${formatBandwidth(host.networkEgressMbps)}${host.networkInterface ? ` · ${host.networkInterface}` : ""}`}
          />
          <Stat
            label="Disk"
            value={`${host.diskFreeGb} GB free`}
            hint={diskPct != null ? `${diskPct}% used · ${counts.running} server(s) running` : undefined}
          />
        </div>
      </Card>

      {hostStats && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricsStatTile
            label={`Avg CPU · ${TIME_RANGES.find((r) => r.value === range)?.label ?? range}`}
            value={hostStats.avgCpu != null ? `${hostStats.avgCpu}%` : "—"}
            sub={hostStats.peakCpu != null ? `Peak ${Math.round(hostStats.peakCpu)}%` : undefined}
          />
          <MetricsStatTile
            label="Avg memory"
            value={hostStats.avgMemory != null ? `${hostStats.avgMemory}%` : "—"}
            sub={hostStats.peakMemory != null ? `Peak ${Math.round(hostStats.peakMemory)}%` : undefined}
          />
          <MetricsStatTile
            label="Peak players"
            value={hostStats.peakPlayers != null ? String(hostStats.peakPlayers) : "—"}
            sub={`${counts.running} running · ${counts.total} total`}
          />
          <MetricsStatTile
            label="Peak game RAM"
            value={hostStats.peakGameRam != null ? `${hostStats.peakGameRam} MB` : "—"}
            sub={gameRamPct != null ? `${gameRamPct}% of host now` : undefined}
          />
          <MetricsStatTile
            label="Peak ingress"
            value={formatBandwidth(hostStats.peakIngress)}
            sub={hostStats.avgIngress != null ? `Avg ${formatBandwidth(hostStats.avgIngress)}` : undefined}
          />
          <MetricsStatTile
            label="Peak egress"
            value={formatBandwidth(hostStats.peakEgress)}
            sub={hostStats.avgEgress != null ? `Avg ${formatBandwidth(hostStats.avgEgress)}` : undefined}
          />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <MetricsAreaChart
          title="CPU load"
          value={`${liveLatest?.cpu ?? latest.cpu}%`}
          hint={host.loadAvg ? `1m ${host.loadAvg[0].toFixed(2)} · ${host.cpuCount ?? 1} cores` : undefined}
          delta={formatDelta(latest.cpu, first?.cpu, "")}
          dataKey="cpu"
          color="#7eb0d4"
          domain={[0, 100]}
          suffix="%"
          data={chartData}
        />
        <MetricsAreaChart
          title="Memory"
          value={`${memPct}%`}
          hint={`${host.memoryFreeMb ?? 0} MB free · ${host.memoryUsedMb ?? 0} / ${host.memoryTotalMb ?? 0} MB used`}
          delta={formatDelta(latest.memory, first?.memory)}
          dataKey="memory"
          color="#6a9ab8"
          domain={[0, 100]}
          suffix="%"
          data={chartData}
        />
        <MetricsAreaChart
          title="Players online"
          value={String(latest.players)}
          hint={`${counts.running} running server(s) · ${counts.total} total`}
          delta={formatDelta(latest.players, first?.players)}
          dataKey="players"
          color="#8b9fd4"
          data={chartData}
        />
        <MetricsAreaChart
          title="Game RAM"
          value={`${liveGameRam || latest.instanceRam} MB`}
          hint={
            gameRamPct != null
              ? `${gameRamPct}% of host RAM · ${counts.running} server(s)`
              : `${counts.running} running server(s)`
          }
          delta={formatDelta(latest.instanceRam, first?.instanceRam, " MB")}
          dataKey="instanceRam"
          color="#5c8fad"
          suffix=" MB"
          data={chartData}
        />
        <MetricsMultiLineChart
          title="Load average"
          value={host.loadAvg ? host.loadAvg[0].toFixed(2) : "—"}
          hint={hostStats?.avgLoad1 != null ? `Period avg ${hostStats.avgLoad1}` : undefined}
          series={[
            { key: "load1", label: "1m", color: "#7eb0d4" },
            { key: "load5", label: "5m", color: "#a8b4c8" },
            { key: "load15", label: "15m", color: "#8b9fd4" },
          ]}
          data={chartData}
        />
        <MetricsAreaChart
          title="Disk free"
          value={`${latest.diskFreeGb} GB`}
          hint={diskPct != null ? `${diskPct}% disk used on host` : undefined}
          dataKey="diskFreeGb"
          color="#a8b4c8"
          suffix=" GB"
          data={chartData}
        />
        <MetricsAreaChart
          title="Ingress (download)"
          value={formatBandwidth(liveLatest?.ingressMbps ?? latest.ingressMbps)}
          hint={
            host.networkInterface
              ? `${host.networkInterface} · 5s live average`
              : "Primary interface · 5s live average"
          }
          dataKey="ingressMbps"
          color="#7eb0d4"
          suffix=" Mbps"
          data={chartData}
        />
        <MetricsAreaChart
          title="Egress (upload)"
          value={formatBandwidth(liveLatest?.egressMbps ?? latest.egressMbps)}
          hint={
            host.networkInterface
              ? `${host.networkInterface} · 5s live average`
              : "Primary interface · 5s live average"
          }
          dataKey="egressMbps"
          color="#8b9fd4"
          suffix=" Mbps"
          data={chartData}
        />
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <h3 className="text-sm font-medium text-foreground">Instances</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {postgresEnabled
                ? "Live stats with stored sparklines for the selected period."
                : "Live process stats from running game servers."}
            </p>
          </div>
          {postgresEnabled && overview?.instances.length ? (
            <p className="font-mono text-[10px] text-muted-foreground">
              {overview.instances.length} tracked · click to drill down
            </p>
          ) : null}
        </div>
        {instances.length > 0 ? (
          <div className="divide-y divide-border">
            {instances.map((instance) => {
              const stored = overviewById.get(instance.id);
              const latestStored = stored?.latest;
              const fpsSpark = stored?.sparkline.length
                ? sparklineToChart(stored.sparkline, range, "fps")
                : [];
              const playerSpark = stored?.sparkline.length
                ? sparklineToChart(stored.sparkline, range, "players")
                : [];
              const ramSpark = stored?.sparkline.length
                ? sparklineToChart(stored.sparkline, range, "memoryMb")
                : [];

              return (
                <button
                  key={instance.id}
                  type="button"
                  onClick={() => onSelectInstance?.(instance.id)}
                  className="grid w-full gap-4 px-4 py-4 text-left transition-colors hover:bg-accent/30 sm:grid-cols-[minmax(0,1.2fr)_repeat(3,minmax(0,1fr))_auto]"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium text-foreground">{instance.name}</p>
                      <StatusBadge status={instance.status} />
                    </div>
                    <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                      :{instance.config.publicPort}
                      {stored?.stats.sampleCount ? ` · ${stored.stats.sampleCount.toLocaleString()} readings` : ""}
                    </p>
                    {stored?.stats.avgFps != null && (
                      <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                        Avg FPS {Math.round(stored.stats.avgFps)}
                        {stored.stats.peakPlayers != null ? ` · peak ${stored.stats.peakPlayers} players` : ""}
                      </p>
                    )}
                  </div>

                  {postgresEnabled && fpsSpark.length > 0 ? (
                    <>
                      <MetricsSparkline
                        label="FPS"
                        value={
                          latestStored?.fps != null
                            ? String(Math.round(latestStored.fps))
                            : instance.runtime?.memoryMb != null
                              ? "—"
                              : "—"
                        }
                        dataKey="fps"
                        color="#7eb0d4"
                        data={fpsSpark}
                      />
                      <MetricsSparkline
                        label="Players"
                        value={
                          latestStored?.playerCount != null
                            ? `${latestStored.playerCount}/${latestStored.maxPlayers ?? instance.config.game.maxPlayers}`
                            : instance.lastKnownPlayerCount != null
                              ? `${instance.lastKnownPlayerCount}/${instance.config.game.maxPlayers}`
                              : "—"
                        }
                        dataKey="players"
                        color="#8b9fd4"
                        data={playerSpark}
                      />
                      <MetricsSparkline
                        label="RAM"
                        value={
                          latestStored?.memoryMb != null
                            ? String(latestStored.memoryMb)
                            : instance.runtime?.memoryMb != null
                              ? String(instance.runtime.memoryMb)
                              : "—"
                        }
                        dataKey="memoryMb"
                        color="#6a9ab8"
                        data={ramSpark}
                        suffix=" MB"
                      />
                    </>
                  ) : (
                    <>
                      <div>
                        <p className="font-mono text-[10px] uppercase text-muted-foreground">Players</p>
                        <p className="mt-0.5 text-sm tabular-nums text-foreground">
                          {instance.status === "running" && instance.lastKnownPlayerCount != null
                            ? `${instance.lastKnownPlayerCount}/${instance.config.game.maxPlayers}`
                            : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="font-mono text-[10px] uppercase text-muted-foreground">RAM</p>
                        <p className="mt-0.5 text-sm tabular-nums text-foreground">
                          {instance.runtime?.memoryMb != null ? `${instance.runtime.memoryMb} MB` : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="font-mono text-[10px] uppercase text-muted-foreground">Uptime</p>
                        <p className="mt-0.5 text-sm tabular-nums text-foreground">
                          {formatRuntime(instance.runtime?.uptimeSec)}
                        </p>
                      </div>
                    </>
                  )}

                  <div className="hidden items-center self-center sm:flex">
                    <span className="font-mono text-[10px] uppercase text-muted-foreground">History →</span>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="px-4 py-6 text-sm text-muted-foreground">No instances configured.</p>
        )}
      </Card>

      <div className="grid gap-px border border-border bg-border sm:grid-cols-3">
        <div className="bg-card px-4 py-3">
          <p className="font-mono text-[10px] uppercase text-muted-foreground">Game server</p>
          <p className="mt-1 text-sm text-foreground">
            {game?.stable.installed
              ? "Stable"
              : game?.experimental.installed
                ? "Experimental"
                : "Not installed"}
          </p>
        </div>
        <div className="bg-card px-4 py-3">
          <p className="font-mono text-[10px] uppercase text-muted-foreground">Instances</p>
          <p className="mt-1 text-sm text-foreground">
            {counts.running} running · {counts.total} total
          </p>
        </div>
        <div className="bg-card px-4 py-3">
          <p className="font-mono text-[10px] uppercase text-muted-foreground">Reforger root</p>
          <p className="mt-1 truncate font-mono text-[11px] text-foreground">{host.reforgerRoot}</p>
        </div>
      </div>
    </div>
  );
}

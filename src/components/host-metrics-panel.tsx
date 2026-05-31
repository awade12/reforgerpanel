"use client";

import { useEffect, useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import type { GameInstallStatus, HostInfo } from "@/lib/shared/types";
import {
  METRICS_POLL_MS,
  type InstanceMetrics,
  type MetricsSample,
  cpuPercent,
  diskUsedPercent,
  formatRuntime,
  gameRamMb,
  memoryPercent,
  pushMetricsSample,
  runningCount,
  sampleFromHost,
} from "@/lib/host-metrics";
import { Card, api, StatusBadge } from "@/components/Shell";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

function MetricChart({
  title,
  value,
  hint,
  dataKey,
  color,
  domain,
  suffix,
  data,
  chartHeight,
}: {
  title: string;
  value: string;
  hint?: string;
  dataKey: keyof MetricsSample;
  color: string;
  domain?: [number, number | "auto"];
  suffix?: string;
  data: MetricsSample[];
  chartHeight: string;
}) {
  const chartConfig = {
    [dataKey]: { label: title, color },
  };

  return (
    <div className="border border-border bg-[#0f1218] p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{title}</p>
          <p className="mt-1 text-xl font-medium tabular-nums text-foreground">{value}</p>
          {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
        </div>
      </div>
      <ChartContainer config={chartConfig} className={`aspect-auto w-full ${chartHeight}`}>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`fill-${String(dataKey)}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={`var(--color-${String(dataKey)})`} stopOpacity={0.35} />
              <stop offset="100%" stopColor={`var(--color-${String(dataKey)})`} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/40" />
          <XAxis
            dataKey="at"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={32}
            className="font-mono text-[10px]"
          />
          <YAxis domain={domain ?? [0, "auto"]} hide />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value) => `${value}${suffix ?? ""}`}
                labelFormatter={(label) => label}
              />
            }
          />
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={`var(--color-${String(dataKey)})`}
            fill={`url(#fill-${String(dataKey)})`}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ChartContainer>
    </div>
  );
}

export function HostMetricsPanel({
  initial,
  game,
  instances = [],
}: {
  initial: HostInfo | null;
  game: GameInstallStatus | null;
  instances?: InstanceMetrics[];
}) {
  const [host, setHost] = useState<HostInfo | null>(initial);
  const [history, setHistory] = useState<MetricsSample[]>(() =>
    initial ? [sampleFromHost(initial, instances)] : [],
  );

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

    const timer = setInterval(() => void poll(), METRICS_POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [instances]);

  const latest = history[history.length - 1];
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
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4">
          <div>
            <p className="font-mono text-[11px] text-muted-foreground">Host</p>
            <h2 className="mt-0.5 text-lg font-medium text-foreground">{host.hostname || host.ips[0] || "—"}</h2>
            <p className="mt-1 font-mono text-[11px] text-muted-foreground">{host.ips[0] || "—"}</p>
          </div>
          <div className="flex flex-wrap items-center gap-6 text-right">
            <div>
              <p className="font-mono text-[10px] uppercase text-muted-foreground">Uptime</p>
              <p className="text-sm tabular-nums text-foreground">{host.uptimeLabel ?? "—"}</p>
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase text-muted-foreground">Samples</p>
              <p className="text-sm tabular-nums text-foreground">
                {history.length} · every {METRICS_POLL_MS / 1000}s
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping bg-chart-1/50" />
                <span className="relative inline-flex size-2 bg-chart-1" />
              </span>
              <span className="font-mono text-[10px] uppercase text-chart-1">Live</span>
            </div>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4">
          <div className="border-b border-r border-border px-4 py-3">
            <p className="font-mono text-[10px] uppercase text-muted-foreground">CPU cores</p>
            <p className="mt-1 text-sm text-foreground">{host.cpuCount ?? "—"}</p>
          </div>
          <div className="border-b border-border px-4 py-3 lg:border-r">
            <p className="font-mono text-[10px] uppercase text-muted-foreground">Load avg</p>
            <p className="mt-1 font-mono text-sm text-foreground">
              {host.loadAvg ? host.loadAvg.map((v) => v.toFixed(2)).join(" · ") : "—"}
            </p>
          </div>
          <div className="border-b border-r border-border px-4 py-3">
            <p className="font-mono text-[10px] uppercase text-muted-foreground">Host memory</p>
            <p className="mt-1 text-sm text-foreground">
              {host.memoryUsedMb ?? 0} / {host.memoryTotalMb ?? 0} MB ({memPct}%)
            </p>
          </div>
          <div className="border-b border-border px-4 py-3">
            <p className="font-mono text-[10px] uppercase text-muted-foreground">Disk</p>
            <p className="mt-1 text-sm text-foreground">
              {host.diskFreeGb} GB free
              {diskPct != null ? ` · ${diskPct}% used` : ""}
            </p>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <MetricChart
          title="CPU load"
          value={`${latest.cpu}%`}
          hint={host.loadAvg ? `1m ${host.loadAvg[0].toFixed(2)} · ${host.cpuCount ?? 1} cores` : undefined}
          dataKey="cpu"
          color="var(--chart-1)"
          domain={[0, 100]}
          suffix="%"
          data={history}
          chartHeight="h-48"
        />
        <MetricChart
          title="Memory"
          value={`${memPct}%`}
          hint={`${host.memoryFreeMb ?? 0} MB free · ${host.memoryUsedMb ?? 0} / ${host.memoryTotalMb ?? 0} MB used`}
          dataKey="memory"
          color="var(--chart-3)"
          domain={[0, 100]}
          suffix="%"
          data={history}
          chartHeight="h-48"
        />
        <MetricChart
          title="Players online"
          value={String(latest.players)}
          hint={`${counts.running} running server(s) · ${counts.total} total`}
          dataKey="players"
          color="var(--chart-2)"
          data={history}
          chartHeight="h-48"
        />
        <MetricChart
          title="Game RAM"
          value={`${liveGameRam || latest.instanceRam} MB`}
          hint={
            gameRamPct != null
              ? `${gameRamPct}% of host RAM · ${counts.running} server(s)`
              : `${counts.running} running server(s)`
          }
          dataKey="instanceRam"
          color="var(--chart-5)"
          suffix=" MB"
          data={history}
          chartHeight="h-48"
        />
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-medium text-foreground">Per-instance</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">Live process stats from running game servers.</p>
        </div>
        {instances.length > 0 ? (
          <div className="divide-y divide-border">
            {instances.map((instance) => (
              <div
                key={instance.id}
                className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))] sm:items-center"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium text-foreground">{instance.name}</p>
                    <StatusBadge status={instance.status} />
                  </div>
                  <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">:{instance.config.publicPort}</p>
                </div>
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
                <div>
                  <p className="font-mono text-[10px] uppercase text-muted-foreground">Profile disk</p>
                  <p className="mt-0.5 text-sm tabular-nums text-foreground">
                    {instance.runtime?.diskUsageMb != null ? `${instance.runtime.diskUsageMb} MB` : "—"}
                  </p>
                </div>
              </div>
            ))}
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

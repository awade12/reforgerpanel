"use client";

import { useEffect, useState } from "react";
import { Shell, Button, PageHeader, api, ApiError } from "@/components/Shell";
import { HostMetricsPanel } from "@/components/host-metrics-panel";
import { InstanceMetricsPanel } from "@/components/instance-metrics-panel";
import type { GameInstallStatus, HostInfo, MetricsSummary } from "@/lib/shared/types";
import type { InstanceMetrics } from "@/lib/host-metrics";
import { formatStoredLabel, storedHistoryTooltip } from "@/lib/instance-metrics";
import { MetricsInlineHint } from "@/components/metrics-stat-hint";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type View = "host" | "instance";

export default function MetricsPage() {
  const [instances, setInstances] = useState<InstanceMetrics[]>([]);
  const [host, setHost] = useState<HostInfo | null>(null);
  const [game, setGame] = useState<GameInstallStatus | null>(null);
  const [status, setStatus] = useState<MetricsSummary | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("host");
  const [selectedId, setSelectedId] = useState("");

  async function load() {
    try {
      const [list, hostInfo, gameStatus, metricsStatus] = await Promise.all([
        api<InstanceMetrics[]>("instances"),
        api<HostInfo>("host"),
        api<GameInstallStatus>("game/status").catch(() => null),
        api<MetricsSummary>("metrics/status").catch(() => null),
      ]);
      setInstances(list);
      setHost(hostInfo);
      setGame(gameStatus);
      setStatus(metricsStatus);
      if (!selectedId && list[0]) setSelectedId(list[0].id);
      setError("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const selected = instances.find((item) => item.id === selectedId) ?? instances[0];

  function openInstance(id: string) {
    setSelectedId(id);
    setView("instance");
  }

  return (
    <Shell contentClassName="max-w-6xl">
      <PageHeader
        title="Metrics"
        description={
          status?.enabled ? (
            <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>Historical metrics saved to PostgreSQL</span>
              <MetricsInlineHint
                value={formatStoredLabel(status.hostSamples, status.instanceSamples, status.retentionDays)}
                tip={storedHistoryTooltip(status.hostSamples, status.instanceSamples, status.retentionDays)}
              />
            </span>
          ) : (
            "Live host metrics only. Add PostgreSQL (DATABASE_URL) to keep history and per-instance graphs."
          )
        }
        actions={
          <Button variant="ghost" onClick={() => void load()}>
            Refresh
          </Button>
        }
      />

      {error && (
        <div className="mb-8 border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="inline-flex border border-border">
          <button
            type="button"
            onClick={() => setView("host")}
            className={`px-4 py-2 text-sm ${view === "host" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            Host
          </button>
          <button
            type="button"
            onClick={() => setView("instance")}
            className={`border-l border-border px-4 py-2 text-sm ${view === "instance" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            Instance
          </button>
        </div>

        {view === "instance" && instances.length > 0 && (
          <Select value={selected?.id ?? ""} onValueChange={setSelectedId}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Select instance" />
            </SelectTrigger>
            <SelectContent>
              {instances.map((instance) => (
                <SelectItem key={instance.id} value={instance.id}>
                  {instance.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {loading && !host ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : view === "host" ? (
        <HostMetricsPanel
          initial={host}
          game={game}
          instances={instances}
          postgresEnabled={status?.enabled ?? false}
          metricsStatus={status}
          onSelectInstance={openInstance}
        />
      ) : selected ? (
        <InstanceMetricsPanel
          instanceId={selected.id}
          instanceName={selected.name}
          instanceStatus={selected.status}
          maxPlayers={selected.config.game.maxPlayers}
        />
      ) : (
        <p className="text-sm text-muted-foreground">No instances configured.</p>
      )}
    </Shell>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Shell, Button, PageHeader, api, ApiError } from "@/components/Shell";
import { HostMetricsPanel } from "@/components/host-metrics-panel";
import type { GameInstallStatus, HostInfo } from "@/lib/shared/types";
import type { InstanceMetrics } from "@/lib/host-metrics";

export default function MetricsPage() {
  const [instances, setInstances] = useState<InstanceMetrics[]>([]);
  const [host, setHost] = useState<HostInfo | null>(null);
  const [game, setGame] = useState<GameInstallStatus | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const [list, hostInfo, gameStatus] = await Promise.all([
        api<InstanceMetrics[]>("instances"),
        api<HostInfo>("host"),
        api<GameInstallStatus>("game/status").catch(() => null),
      ]);
      setInstances(list);
      setHost(hostInfo);
      setGame(gameStatus);
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

  return (
    <Shell>
      <PageHeader
        title="Metrics"
        description="Live host and game server resource usage. Updates every 5 seconds."
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

      {loading && !host ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <HostMetricsPanel initial={host} game={game} instances={instances} />
      )}
    </Shell>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Shell, Card, Button, PageHeader, LinkButton, StatusBadge, api, ApiError } from "@/components/Shell";
import { InstanceActionButtons } from "@/components/instance-action-buttons";
import { isInstanceLive } from "@/lib/shared/instance-state";
import { HostSummaryCard } from "@/components/host-summary-card";
import type { HostInfo } from "@/lib/shared/types";
import type { InstanceMetrics } from "@/lib/host-metrics";

interface DashboardInstance extends InstanceMetrics {
  slug: string;
  branch: string;
  config: InstanceMetrics["config"] & {
    game: InstanceMetrics["config"]["game"] & { scenarioId: string };
  };
}

function formatRuntime(sec?: number) {
  if (sec == null) return "—";
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatPlayers(instance: DashboardInstance) {
  if (!isInstanceLive(instance.status)) return "—";
  const max = instance.config.game.maxPlayers;
  if (instance.lastKnownPlayerCount != null) {
    return `${instance.lastKnownPlayerCount}/${max}`;
  }
  return `—/${max}`;
}

export default function DashboardPage() {
  const [instances, setInstances] = useState<DashboardInstance[]>([]);
  const [host, setHost] = useState<HostInfo | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load(manual = false) {
    try {
      if (manual) setRefreshing(true);
      else if (!instances.length) setLoading(true);

      const [list, hostInfo] = await Promise.all([
        api<DashboardInstance[]>("instances"),
        api<HostInfo>("host"),
      ]);

      setInstances(list);
      setHost(hostInfo);
      setError("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 15000);
    return () => clearInterval(timer);
  }, []);

  async function action(id: string, kind: "start" | "stop" | "restart") {
    try {
      setError("");
      await api(`instances/${id}/${kind}`, { method: "POST" });
      await load(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Action failed");
    }
  }

  return (
    <Shell>
      <PageHeader
        title="Dashboard"
        description="Host resources and dedicated server instances on this machine."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" disabled={refreshing} onClick={() => void load(true)}>
              {refreshing ? "Refreshing…" : "Refresh"}
            </Button>
            <LinkButton href="/game">Install game</LinkButton>
            <LinkButton href="/instances/new" variant="primary">
              New instance
            </LinkButton>
          </div>
        }
      />

      {error && (
        <div className="mb-8 border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
          {error.includes("agent") && (
            <p className="mt-2 text-xs opacity-80">Run on the server: npm run agent</p>
          )}
        </div>
      )}

      {loading && !instances.length ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <HostSummaryCard host={host} instances={instances} />

          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h3 className="font-mono text-[11px] uppercase text-muted-foreground">Instances</h3>
            <span className="font-mono text-[11px] text-muted-foreground">{instances.length} total</span>
          </div>

          {instances.length > 0 ? (
            <Card className="overflow-hidden">
              <div className="divide-y divide-border">
                {instances.map((instance) => (
                  <div
                    key={instance.id}
                    className="flex flex-col gap-4 px-4 py-4 lg:flex-row lg:items-center lg:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                        <h4 className="text-sm font-medium text-foreground">{instance.name}</h4>
                        <StatusBadge status={instance.status} />
                      </div>
                      <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[11px] text-muted-foreground">
                        <div>
                          <dt className="sr-only">Port</dt>
                          <dd>:{instance.config.publicPort}</dd>
                        </div>
                        <div>
                          <dt className="sr-only">Branch</dt>
                          <dd>{instance.branch}</dd>
                        </div>
                        <div>
                          <dt className="sr-only">Scenario</dt>
                          <dd>{instance.config.game.scenarioId.split("/").pop()}</dd>
                        </div>
                        <div>
                          <dt className="sr-only">Players</dt>
                          <dd>{formatPlayers(instance)}</dd>
                        </div>
                        <div>
                          <dt className="sr-only">Memory</dt>
                          <dd>{instance.runtime?.memoryMb != null ? `${instance.runtime.memoryMb} MB` : "—"}</dd>
                        </div>
                        <div>
                          <dt className="sr-only">Uptime</dt>
                          <dd>{formatRuntime(instance.runtime?.uptimeSec)}</dd>
                        </div>
                        <div>
                          <dt className="sr-only">Systemd</dt>
                          <dd>systemd {instance.runtime?.systemdActive ? "on" : "off"}</dd>
                        </div>
                      </dl>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <InstanceActionButtons
                        status={instance.status}
                        onAction={(kind) => void action(instance.id, kind)}
                      />
                      <LinkButton href={`/instances/${instance.id}`}>Manage</LinkButton>
                      <LinkButton href={`/instances/${instance.id}/logs`} variant="ghost">
                        Logs
                      </LinkButton>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ) : (
            <Card>
              <div className="px-4 py-8">
                <p className="text-sm text-muted-foreground">No instances configured yet.</p>
                <div className="mt-4">
                  <LinkButton href="/instances/new" variant="primary">
                    New instance
                  </LinkButton>
                </div>
              </div>
            </Card>
          )}
        </>
      )}
    </Shell>
  );
}

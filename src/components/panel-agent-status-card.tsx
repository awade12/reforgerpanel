"use client";

import { useEffect, useMemo, useState } from "react";
import type { HostHealthLevel, HostStatus, HostStatusCheck } from "@/lib/shared/types";
import { api, Card, LinkButton, Stat } from "@/components/Shell";
import { cn } from "@/lib/utils";

function healthTone(level: HostHealthLevel) {
  if (level === "healthy") return "border-chart-1/40 bg-chart-1/10 text-chart-1";
  if (level === "attention") return "border-[#d4a574]/40 bg-[#d4a574]/10 text-[#d4a574]";
  return "border-destructive/40 bg-destructive/10 text-destructive";
}

function healthShort(level: HostHealthLevel) {
  if (level === "healthy") return "OK";
  if (level === "attention") return "Check";
  return "Issues";
}

function agentHealthLevel(status: HostStatus): HostHealthLevel {
  if (!status.agent?.metricsCollecting) {
    return status.metrics?.enabled === false ? "healthy" : "attention";
  }
  const at = status.metrics?.latestSampleAt;
  if (!at) return "attention";
  if (Date.now() - new Date(at).getTime() > 120_000) return "attention";
  return "healthy";
}

function formatAgo(ms: number) {
  const sec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (sec < 10) return "just now";
  if (sec < 60) return `${sec}s ago`;
  return `${Math.floor(sec / 60)}m ago`;
}

function historyLabel(status: HostStatus) {
  const m = status.metrics;
  if (!m?.enabled) return "Off";
  if (!m.latestSampleAt) return "Starting…";
  return "On";
}

function historyHint(status: HostStatus) {
  const m = status.metrics;
  if (!m?.enabled) return "Charts on Metrics use live data only";
  return `${m.retentionDays}-day history · refreshes every ${m.collectIntervalSec ?? 15}s`;
}

function checkTone(level: HostStatusCheck["level"]) {
  if (level === "warn") return "text-[#d4a574]";
  return "text-destructive";
}

export function PanelAgentStatusCard({
  className,
  showDashboardLink = false,
  showMetricsLink = true,
  compact = false,
}: {
  className?: string;
  showDashboardLink?: boolean;
  showMetricsLink?: boolean;
  compact?: boolean;
}) {
  const [status, setStatus] = useState<HostStatus | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [offline, setOffline] = useState(false);

  async function load() {
    try {
      const hostStatus = await api<HostStatus>("host/status?quick=1");
      setStatus(hostStatus);
      setFetchedAt(Date.now());
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 15000);
    return () => clearInterval(timer);
  }, []);

  const issues = useMemo(
    () => (status?.checks ?? []).filter((check) => check.level !== "ok"),
    [status?.checks],
  );

  const live = !offline && status != null;
  const agentLevel = status ? agentHealthLevel(status) : "attention";
  const fleetLevel = status?.overall ?? "attention";

  if (offline && !status) {
    return (
      <Card className={cn("overflow-hidden", className)}>
        <div className="px-4 py-6">
          <p className="text-sm font-medium text-foreground">Panel not connected</p>
          <p className="mt-2 text-sm text-muted-foreground">
            The background service on this machine is not responding. Start it from the server with{" "}
            <span className="font-mono text-foreground">npm run agent</span> or restart{" "}
            <span className="font-mono text-foreground">reforgerpanel-agent</span>.
          </p>
        </div>
      </Card>
    );
  }

  if (!status) return null;

  const { instances, host } = status;

  return (
    <Card className={cn("overflow-hidden", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="font-mono text-[11px] text-muted-foreground">Panel agent</p>
          <p className="mt-0.5 text-sm font-medium text-foreground">
            {host.hostname || host.primaryIp || "This host"}
            <span className="font-normal text-muted-foreground">
              {" "}
              · {live ? "Connected" : "Offline"}
              {fetchedAt != null ? ` · ${formatAgo(fetchedAt)}` : ""}
            </span>
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <span
              className={cn(
                "inline-flex items-center border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide",
                healthTone(agentLevel),
              )}
            >
              Agent {healthShort(agentLevel)}
            </span>
            <span
              className={cn(
                "inline-flex items-center border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide",
                healthTone(fleetLevel),
              )}
            >
              Servers {healthShort(fleetLevel)}
              {issues.length > 0 ? ` (${issues.length})` : ""}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {showDashboardLink && (
            <LinkButton href="/" variant="ghost">
              Dashboard
            </LinkButton>
          )}
          {showMetricsLink && !compact && (
            <LinkButton href="/metrics" variant="primary">
              Open metrics
            </LinkButton>
          )}
        </div>
      </div>

      {!compact && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="History" value={historyLabel(status)} hint={historyHint(status)} />
          <Stat
            label="Servers"
            value={`${instances.running} running`}
            hint={[
              instances.crashed > 0 ? `${instances.crashed} crashed` : null,
              instances.stopped > 0 ? `${instances.stopped} stopped` : null,
              instances.totalPlayers > 0 ? `${instances.totalPlayers} players` : null,
            ]
              .filter(Boolean)
              .join(" · ") || "All idle"}
          />
          <Stat label="Host load" value={host.loadAvg[0].toFixed(1)} hint={`${host.uptimeLabel} uptime`} />
          <Stat label="Disk" value={`${host.diskFreeGb} GB free`} hint={`${host.diskTotalGb || "?"} GB total`} />
        </div>
      )}

      {compact && (
        <div className="grid grid-cols-3 gap-px border-t border-border bg-border sm:grid-cols-3">
          <div className="bg-card px-4 py-3">
            <p className="font-mono text-[10px] uppercase text-muted-foreground">History</p>
            <p className="mt-1 text-sm font-medium text-foreground">{historyLabel(status)}</p>
          </div>
          <div className="bg-card px-4 py-3">
            <p className="font-mono text-[10px] uppercase text-muted-foreground">Servers</p>
            <p className="mt-1 text-sm font-medium text-foreground">
              {instances.running} running
              {instances.crashed > 0 ? ` · ${instances.crashed} down` : ""}
            </p>
          </div>
          <div className="bg-card px-4 py-3">
            <p className="font-mono text-[10px] uppercase text-muted-foreground">Host</p>
            <p className="mt-1 text-sm font-medium text-foreground">{host.diskFreeGb} GB free</p>
          </div>
        </div>
      )}

      {offline && (
        <p className="border-t border-[#d4a574]/30 bg-[#d4a574]/10 px-4 py-2 text-xs text-[#d4a574]">
          Could not refresh just now — showing the last successful check.
        </p>
      )}

      {issues.length > 0 && (
        <ul className="divide-y divide-border border-t border-border">
          {issues.slice(0, 6).map((check) => (
            <li key={check.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
              <div className="min-w-0">
                <p className="text-sm text-foreground">{check.label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{check.detail}</p>
              </div>
              <span className={cn("shrink-0 font-mono text-[10px] uppercase", checkTone(check.level))}>
                {check.level === "warn" ? "Warn" : "Error"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

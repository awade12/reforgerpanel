"use client";

import type { HostInfo } from "@/lib/shared/types";
import { cpuPercent, gameRamMb, memoryPercent, runningCount, type InstanceMetrics } from "@/lib/host-metrics";
import { Card, LinkButton, Stat } from "@/components/Shell";

export function HostSummaryCard({
  host,
  instances = [],
}: {
  host: HostInfo | null;
  instances?: InstanceMetrics[];
}) {
  if (!host) return null;

  const counts = runningCount(host, instances);
  const ram = gameRamMb(host, instances);

  return (
    <Card className="mb-8 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <p className="font-mono text-[11px] text-muted-foreground">Host</p>
          <h2 className="mt-0.5 text-sm font-medium text-foreground">{host.hostname || host.ips[0] || "—"}</h2>
        </div>
        <LinkButton href="/metrics" variant="primary">
          Open metrics
        </LinkButton>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="CPU load" value={`${cpuPercent(host)}%`} />
        <Stat label="Memory" value={`${memoryPercent(host)}%`} />
        <Stat label="Game RAM" value={`${ram} MB`} />
        <Stat
          label="Instances"
          value={`${counts.running} running`}
          hint={`${host.diskFreeGb} GB disk free`}
        />
      </div>
    </Card>
  );
}

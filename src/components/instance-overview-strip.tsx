"use client";

import { useInstanceWorkspace } from "@/components/instance-workspace";

export function InstanceOverviewStrip() {
  const { instance } = useInstanceWorkspace();
  if (!instance) return null;

  const scenario = instance.config.game.scenarioId.split("/").pop();

  return (
    <div className="mb-8 grid gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
      {[
        { label: "Branch", value: instance.branch },
        { label: "Scenario", value: scenario ?? "—" },
        { label: "Public IP", value: instance.config.publicAddress || "Not set" },
        {
          label: "Profile",
          value: instance.runtime?.diskUsageMb != null ? `${instance.runtime.diskUsageMb} MB` : "—",
        },
      ].map((item) => (
        <div key={item.label} className="bg-card px-4 py-3">
          <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{item.label}</p>
          <p className="mt-1 truncate text-sm font-medium text-foreground">{item.value}</p>
        </div>
      ))}
    </div>
  );
}

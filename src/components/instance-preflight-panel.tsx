"use client";

import type { PreflightCheck, PreflightReport } from "@/lib/shared/preflight";
import { buildConfigPreflightChecks, mergePreflightReport } from "@/lib/shared/preflight";
import type { ServerConfig } from "@/lib/shared/config-schema";
import { Button } from "@/components/Shell";

const CATEGORY_LABELS: Record<PreflightCheck["category"], string> = {
  config: "Config (Bohemia schema)",
  network: "Firewall & ports",
  host: "Host connectivity",
  mods: "Mods",
  battleye: "BattlEye",
};

function severityLabel(severity: PreflightCheck["severity"]) {
  if (severity === "ok") return "OK";
  if (severity === "warn") return "Warn";
  return "Block";
}

function severityClass(severity: PreflightCheck["severity"]) {
  if (severity === "ok") return "text-chart-1";
  if (severity === "warn") return "text-[#d4a574]";
  return "text-destructive";
}

export function localPreflight(config: ServerConfig, ipHint?: string): PreflightReport {
  return mergePreflightReport(buildConfigPreflightChecks(config, ipHint));
}

export function InstancePreflightPanel({
  preflight,
  loading,
  onRefresh,
  onForceStart,
  showForceStart,
}: {
  preflight: PreflightReport;
  loading?: boolean;
  onRefresh?: () => void;
  onForceStart?: () => void;
  showForceStart?: boolean;
}) {
  const grouped = Object.keys(CATEGORY_LABELS) as PreflightCheck["category"][];

  return (
    <section className="mb-8 border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <p className="font-mono text-[11px] text-muted-foreground">Pre-flight</p>
          <h2 className="mt-0.5 text-sm font-medium text-foreground">
            {preflight.canStart ? "Ready to start" : "Fix errors before start"}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {preflight.errorCount} blocking · {preflight.warnCount} warnings
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {onRefresh && (
            <Button variant="ghost" disabled={loading} onClick={onRefresh}>
              {loading ? "Checking…" : "Run checks"}
            </Button>
          )}
          {showForceStart && !preflight.canStart && onForceStart && (
            <Button variant="ghost" onClick={onForceStart}>
              Start anyway
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-2">
        {grouped.map((category) => {
          const items = preflight.checks.filter((c) => c.category === category);
          if (!items.length) return null;
          return (
            <div key={category} className="border border-border p-3">
              <p className="text-xs font-medium text-foreground">{CATEGORY_LABELS[category]}</p>
              <ul className="mt-3 space-y-2">
                {items.map((check) => (
                  <li key={check.id} className="border border-border px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs text-foreground">{check.label}</span>
                      <span className={`text-xs ${severityClass(check.severity)}`}>
                        {severityLabel(check.severity)}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{check.detail}</p>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

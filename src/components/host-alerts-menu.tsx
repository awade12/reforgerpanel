"use client";

import { useEffect, useMemo, useState } from "react";
import { BellIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { HostStatus, HostStatusCheck } from "@/lib/shared/types";
import { cn } from "@/lib/utils";

async function loadHostStatus(quick = true): Promise<HostStatus | null> {
  try {
    const res = await fetch(`/api/agent/host/status${quick ? "?quick=1" : ""}`);
    if (!res.ok) return null;
    return (await res.json()) as HostStatus;
  } catch {
    return null;
  }
}

function checkClass(level: HostStatusCheck["level"]) {
  if (level === "warn") return "text-[#d4a574]";
  return "text-destructive";
}

export function HostAlertsMenu({ variant = "default" }: { variant?: "default" | "sidebar" }) {
  const [status, setStatus] = useState<HostStatus | null>(null);

  useEffect(() => {
    let active = true;
    let fullTimer: ReturnType<typeof setInterval> | null = null;

    async function load(quick = true) {
      const data = await loadHostStatus(quick);
      if (active) setStatus(data);
    }

    void load(true);
    const quickTimer = setInterval(() => void load(true), 20000);
    fullTimer = setInterval(() => void load(false), 120000);

    return () => {
      active = false;
      clearInterval(quickTimer);
      if (fullTimer) clearInterval(fullTimer);
    };
  }, []);

  const issues = useMemo(
    () => (status?.checks ?? []).filter((check) => check.level !== "ok"),
    [status?.checks],
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "relative inline-flex size-8 shrink-0 items-center justify-center border text-muted-foreground transition-colors",
            variant === "sidebar"
              ? "border-sidebar-border hover:bg-sidebar-accent hover:text-sidebar-foreground"
              : "border-border hover:bg-secondary hover:text-foreground",
          )}
          aria-label={issues.length ? `${issues.length} alerts` : "Alerts"}
        >
          <BellIcon className="size-4" strokeWidth={1.75} />
          {issues.length > 0 && (
            <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center bg-[#d4a574] text-[9px] font-semibold text-background">
              {issues.length > 9 ? "9+" : issues.length}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="font-normal">
          <p className="text-sm font-medium text-foreground">Alerts</p>
          <p className="text-xs font-normal text-muted-foreground">
            {status
              ? issues.length
                ? `${issues.length} item(s) to review`
                : "Nothing needs attention"
              : "Status unavailable"}
          </p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {issues.length > 0 ? (
          <ul className="max-h-80 overflow-y-auto py-1">
            {issues.map((check) => (
              <li key={check.id} className="border-b border-border px-3 py-2.5 last:border-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground">{check.label}</p>
                    <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{check.detail}</p>
                  </div>
                  <span className={cn("shrink-0 font-mono text-[9px] uppercase", checkClass(check.level))}>
                    {check.level}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-3 py-4 text-xs text-muted-foreground">All checks passed.</p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

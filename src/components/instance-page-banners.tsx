"use client";

import { useInstanceWorkspace } from "@/components/instance-workspace";
import { cn } from "@/lib/utils";

export function InstancePageBanners() {
  const { actionWarnings, message, actionError, pollStale } = useInstanceWorkspace();

  if (!actionWarnings.length && !message && !actionError && !pollStale) return null;

  return (
    <>
      {pollStale && (
        <div className="mb-6 border border-[#d4a574]/30 bg-[#d4a574]/10 px-4 py-3 text-sm text-[#d4a574]">
          Status may be outdated — the panel could not refresh from the agent. The server may still be running; try
          Refresh or reload the page.
        </div>
      )}
      {actionWarnings.length > 0 && (
        <div className="mb-6 border border-[#d4a574]/30 bg-[#d4a574]/10 px-4 py-3">
          <p className="mb-2 text-sm font-medium text-[#d4a574]">Start warnings</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-[#d4a574]/90">
            {actionWarnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {(actionError || message) && (
        <div
          className={cn(
            "mb-6 border px-4 py-3 text-sm",
            actionError
              ? "border-destructive/30 bg-destructive/10 text-destructive"
              : "border-chart-1/30 bg-chart-1/10 text-chart-1",
          )}
        >
          {actionError || message}
        </div>
      )}
    </>
  );
}

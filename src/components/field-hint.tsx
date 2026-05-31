"use client";

import { InfoIcon } from "lucide-react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";

export function FieldHint({
  label,
  text,
  className,
}: {
  label: string;
  text: string;
  className?: string;
}) {
  return (
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          className={cn(
            "group/hint inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-border/70 bg-secondary/50 text-muted-foreground transition-all",
            "hover:border-chart-1/50 hover:bg-chart-1/10 hover:text-chart-1",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chart-1/30",
            "data-[state=open]:border-chart-1/50 data-[state=open]:bg-chart-1/10 data-[state=open]:text-chart-1",
            className,
          )}
          aria-label={`Help: ${label}`}
        >
          <InfoIcon className="size-3" strokeWidth={2} />
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        side="right"
        align="start"
        sideOffset={10}
        collisionPadding={16}
        className="w-[17.5rem] rounded-none border border-border bg-card p-0 shadow-[0_8px_30px_rgb(0_0_0/0.35)] ring-0"
      >
        <div className="flex min-w-0">
          <div className="w-px shrink-0 bg-chart-1/80" />
          <div className="min-w-0 flex-1">
            <div className="border-b border-border bg-secondary/30 px-3 py-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-chart-1">{label}</p>
            </div>
            <p className="px-3 py-3 text-[13px] leading-6 text-muted-foreground">{text}</p>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

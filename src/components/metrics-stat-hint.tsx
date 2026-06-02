"use client";

import { InfoIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type MetricsStatHintProps = {
  label: string;
  value: string;
  tip: string;
  align?: "left" | "right";
};

export function MetricsStatHint({ label, value, tip, align = "right" }: MetricsStatHintProps) {
  return (
    <div className={align === "right" ? "text-right" : "text-left"}>
      <div className={`flex items-center gap-1 ${align === "right" ? "justify-end" : "justify-start"}`}>
        <p className="font-mono text-[10px] uppercase text-muted-foreground">{label}</p>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="inline-flex text-muted-foreground transition-colors hover:text-foreground"
              aria-label={`About ${label}`}
            >
              <InfoIcon className="size-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6} className="max-w-[260px] text-left leading-relaxed">
            {tip}
          </TooltipContent>
        </Tooltip>
      </div>
      <p className="text-sm tabular-nums text-foreground">{value}</p>
    </div>
  );
}

type MetricsInlineHintProps = {
  value: string;
  tip: string;
};

export function MetricsInlineHint({ value, tip }: MetricsInlineHintProps) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <span>{value}</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex text-muted-foreground transition-colors hover:text-foreground"
            aria-label="About this graph"
          >
            <InfoIcon className="size-3" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6} className="max-w-[260px] text-left leading-relaxed">
          {tip}
        </TooltipContent>
      </Tooltip>
    </span>
  );
}

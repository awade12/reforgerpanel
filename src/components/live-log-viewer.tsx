"use client";

import { useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";

const LEVEL_CLASS: Record<string, string> = {
  DEFAULT: "text-muted-foreground",
  WORLD: "text-chart-1",
  ERROR: "text-destructive",
  WARN: "text-[#d4a574]",
  WARNING: "text-[#d4a574]",
  SCRIPT: "text-[#9cb896]",
  RESOURCES: "text-[#8b9fd4]",
  NETWORK: "text-[#7eb0d4]",
  SYSTEM: "text-[#a8b4c8]",
};

type ParsedLine =
  | { kind: "empty" }
  | { kind: "separator"; text: string }
  | { kind: "meta"; text: string }
  | { kind: "plain"; text: string }
  | { kind: "entry"; time: string; level: string; message: string };

function parseLine(line: string): ParsedLine {
  const trimmed = line.trimEnd();
  if (!trimmed) return { kind: "empty" };
  if (/^-{8,}$/.test(trimmed)) return { kind: "separator", text: trimmed };
  if (trimmed.startsWith("Log ") || trimmed.startsWith("started at")) return { kind: "meta", text: trimmed };

  const match = trimmed.match(/^(\d{2}:\d{2}:\d{2}\.\d{3})\s+(\S+)\s*:\s*(.*)$/);
  if (match) {
    return { kind: "entry", time: match[1], level: match[2], message: match[3] };
  }

  return { kind: "plain", text: trimmed };
}

function MessageText({ message }: { message: string }) {
  const parts = message.split(/([A-Za-z][A-Za-z0-9_]*(?: \([^)]*\))?:)/g).filter(Boolean);

  return (
    <span className="break-all">
      {parts.map((part, index) =>
        part.endsWith(":") ? (
          <span key={index} className="text-[#8b929e]">
            {part}
          </span>
        ) : (
          <span key={index} className="text-[#dce4f2]/90">
            {part}
          </span>
        ),
      )}
    </span>
  );
}

function LogLine({ line }: { line: ParsedLine }) {
  if (line.kind === "empty") return <div className="h-2" aria-hidden />;

  if (line.kind === "separator") {
    return <div className="my-1 border-t border-[#363d48]/80" aria-hidden />;
  }

  if (line.kind === "meta") {
    return (
      <div className="py-0.5 font-mono text-[11px] leading-5 text-chart-1/80">
        {line.text.startsWith("Log ") ? (
          <>
            <span className="text-[#8b929e]">Log </span>
            <span className="text-[#dce4f2]/75">{line.text.slice(4)}</span>
          </>
        ) : (
          line.text
        )}
      </div>
    );
  }

  if (line.kind === "plain") {
    return <div className="py-0.5 font-mono text-[11px] leading-5 text-[#dce4f2]/80">{line.text}</div>;
  }

  const levelClass = LEVEL_CLASS[line.level] ?? "text-[#a8b4c8]";

  return (
    <div className="group flex gap-3 py-0.5 font-mono text-[11px] leading-5">
      <span className="w-[4.75rem] shrink-0 tabular-nums text-[#6b7280]">{line.time}</span>
      <span className={cn("w-[4.5rem] shrink-0 uppercase tracking-wide", levelClass)}>{line.level}</span>
      <span className="min-w-0 flex-1">
        <MessageText message={line.message} />
      </span>
    </div>
  );
}

export function LiveLogViewer({
  logs,
  logFile,
  fps,
  followTail,
  onFollowTailChange,
  onClear,
  onRefresh,
  fullPage = false,
  className,
}: {
  logs: string;
  logFile?: string | null;
  fps?: number | null;
  followTail?: boolean;
  onFollowTailChange?: (follow: boolean) => void;
  onClear: () => void;
  onRefresh?: () => void;
  fullPage?: boolean;
  className?: string;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const lines = useMemo(() => logs.split("\n").map(parseLine), [logs]);
  const lineCount = lines.filter((line) => line.kind !== "empty").length;
  const live = logs.length > 0;
  const tailEnabled = followTail ?? true;

  useEffect(() => {
    if (!tailEnabled) return;
    const node = viewportRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [logs, tailEnabled]);

  return (
    <section
      className={cn(
        "flex flex-col overflow-hidden border border-border bg-card",
        fullPage ? "h-[calc(100vh-14rem)] max-h-[calc(100vh-14rem)]" : "max-h-[560px]",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 shrink-0">
        <div className="flex min-w-0 items-center gap-3">
          <div>
            <p className="font-mono text-[11px] text-muted-foreground">Output</p>
            <h2 className="mt-0.5 text-sm font-medium text-foreground">Live logs</h2>
          </div>
          {live && tailEnabled && (
            <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-chart-1">
              <span className="size-1.5 animate-pulse rounded-full bg-chart-1" />
              Streaming
            </span>
          )}
          {live && !tailEnabled && (
            <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">Paused</span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {fps != null && (
            <span className="font-mono text-[10px] tabular-nums text-chart-1">{fps.toFixed(1)} FPS</span>
          )}
          <span className="font-mono text-[10px] tabular-nums text-muted-foreground">{lineCount} lines</span>
          {onFollowTailChange && (
            <button
              type="button"
              onClick={() => onFollowTailChange(!tailEnabled)}
              className={cn(
                "border px-2 py-1 font-mono text-[10px] uppercase tracking-wide transition-colors",
                tailEnabled
                  ? "border-chart-1/40 text-chart-1"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {tailEnabled ? "Tail on" : "Tail off"}
            </button>
          )}
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              className="border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground"
            >
              Refresh
            </button>
          )}
          <button
            type="button"
            onClick={onClear}
            className="border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground"
          >
            Clear view
          </button>
        </div>
      </div>

      {logFile && (
        <div className="shrink-0 border-b border-border bg-secondary/20 px-4 py-2">
          <p className="truncate font-mono text-[10px] text-muted-foreground">
            <span className="text-foreground/70">Source </span>
            {logFile}
          </p>
        </div>
      )}

      <div className="sticky top-0 z-10 grid shrink-0 grid-cols-[4.75rem_4.5rem_1fr] gap-3 border-b border-[#363d48] bg-[#1e232b] px-4 py-2 font-mono text-[10px] uppercase tracking-wider text-[#6b7280]">
        <span>Time</span>
        <span>Level</span>
        <span>Message</span>
      </div>

      <div
        ref={viewportRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[#1e232b] px-4 py-3"
      >
        {!live ? (
          <p className="font-mono text-[11px] text-muted-foreground">
            Waiting for log output… Start the instance if the server is stopped.
          </p>
        ) : (
          <div className="min-w-0 space-y-px">
            {lines.map((line, index) => (
              <LogLine key={index} line={line} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

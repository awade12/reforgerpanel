"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { StatusBadge } from "@/components/status-badge";
import { cn } from "@/lib/utils";

export type ShellHeaderState = {
  title: string;
  status?: string;
  meta?: string;
  actions?: React.ReactNode;
};

const ShellHeaderContext = createContext<{
  header: ShellHeaderState | null;
  setHeader: (header: ShellHeaderState | null) => void;
} | null>(null);

export function useShellHeader(header: ShellHeaderState | null) {
  const context = useContext(ShellHeaderContext);
  if (!context) {
    throw new Error("useShellHeader must be used within the panel layout");
  }

  const { setHeader } = context;

  useEffect(() => {
    setHeader(header);
    return () => setHeader(null);
  }, [setHeader, header]);
}

export function ShellHeaderProvider({ children }: { children: React.ReactNode }) {
  const [header, setHeader] = useState<ShellHeaderState | null>(null);
  return <ShellHeaderContext.Provider value={{ header, setHeader }}>{children}</ShellHeaderContext.Provider>;
}

export function ShellPageHeader() {
  const context = useContext(ShellHeaderContext);
  const { state, isMobile } = useSidebar();
  const header = context?.header;
  const showToggle = isMobile || state === "collapsed";

  if (!header && !showToggle) return null;

  return (
    <div className={cn("mb-8", header && "border-b border-border pb-6")}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          {showToggle && (
            <SidebarTrigger
              className="shrink-0"
              aria-label={state === "collapsed" ? "Show navigation" : "Toggle navigation"}
            />
          )}
          {header && (
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-xl font-semibold tracking-tight text-foreground">{header.title}</h1>
                {header.status && <StatusBadge status={header.status} />}
              </div>
              {header.meta && (
                <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">{header.meta}</p>
              )}
            </div>
          )}
        </div>
        {header?.actions && <div className="flex shrink-0 flex-wrap gap-2">{header.actions}</div>}
      </div>
    </div>
  );
}

export function ShellHeaderSync({ header }: { header: ShellHeaderState | null }) {
  useShellHeader(header);
  return null;
}

import Link from "next/link";
import { CrosshairIcon } from "lucide-react";
import { getPanelDisplayTitle, PANEL_PRODUCT_NAME } from "@/lib/shared/panel-brand";
import { getPanelVersion } from "@/lib/shared/panel-version";

export function PanelSidebarBrand() {
  const title = getPanelDisplayTitle();

  return (
    <Link href="/" className="flex w-full items-center justify-between gap-3">
      <span className="truncate text-sm font-semibold tracking-tight text-sidebar-foreground">{title}</span>
      <CrosshairIcon className="size-4 shrink-0 text-chart-1" strokeWidth={1.85} aria-hidden />
    </Link>
  );
}

export function PanelSidebarFooterBrand() {
  return (
    <div className="px-3 py-2">
      <p className="truncate text-xs font-medium text-sidebar-foreground">{PANEL_PRODUCT_NAME}</p>
      <p className="font-mono text-[10px] text-muted-foreground">v{getPanelVersion()}</p>
    </div>
  );
}

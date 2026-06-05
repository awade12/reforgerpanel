"use client";

import { usePathname } from "next/navigation";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { NavigationWarmup } from "@/components/navigation-warmup";
import { PageTransition } from "@/components/page-transition";
import { ShellHeaderProvider, ShellPageHeader } from "@/components/shell-header";

const BARE_PREFIXES = ["/login", "/setup"];

function isBareRoute(pathname: string) {
  return BARE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function PanelChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (isBareRoute(pathname)) {
    return <PageTransition>{children}</PageTransition>;
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "16rem",
          "--sidebar-width-mobile": "18rem",
        } as React.CSSProperties
      }
    >
      <NavigationWarmup />
      <AppSidebar />
      <ShellHeaderProvider>
        <SidebarInset>
          <div className="flex-1 px-4 py-8 sm:px-8 lg:px-10 lg:py-10">
            <PageTransition>
              <ShellPageHeader />
              {children}
            </PageTransition>
          </div>
        </SidebarInset>
      </ShellHeaderProvider>
    </SidebarProvider>
  );
}

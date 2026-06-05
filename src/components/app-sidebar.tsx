"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3Icon,
  BookOpenIcon,
  BotIcon,
  CompassIcon,
  ImportIcon,
  LogOutIcon,
  PlusIcon,
  SquareTerminalIcon,
  UsersIcon,
  WrenchIcon,
} from "lucide-react";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader } from "@/components/ui/sidebar";
import { clearAuthSnapshot, fetchAuthSnapshot, getAuthSnapshot } from "@/lib/auth-client";
import {
  getSidebarInstancesCache,
  loadSidebarInstances,
  type SidebarInstance,
} from "@/lib/sidebar-instances";
import { HostAlertsMenu } from "@/components/host-alerts-menu";
import { prefetchApi } from "@/components/Shell";
import { PanelSidebarBrand, PanelSidebarFooterBrand } from "@/components/panel-logo";
import { isInstanceLive } from "@/lib/shared/instance-state";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  match: (path: string) => boolean;
};

function SideLink({
  href,
  active,
  icon: Icon,
  label,
  trailing,
  onPrefetch,
}: {
  href: string;
  active: boolean;
  icon: LucideIcon;
  label: string;
  trailing?: React.ReactNode;
  onPrefetch?: () => void;
}) {
  const router = useRouter();

  function warm() {
    router.prefetch(href);
    onPrefetch?.();
  }

  return (
    <Link
      href={href}
      prefetch
      onMouseEnter={warm}
      onFocus={warm}
      className={cn(
        "flex h-9 items-center gap-2.5 px-3 text-[13px] transition-colors",
        active ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon strokeWidth={1.85} className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {trailing}
    </Link>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-2">
      <p className="px-3 pb-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="flex flex-col">{children}</div>
    </div>
  );
}

function statusDot(status: string) {
  return (
    <span
      className={cn(
        "size-1.5 shrink-0 rounded-full",
        status === "running" && "bg-chart-1",
        status === "crashed" && "bg-destructive",
        (status === "starting" || status === "stopping") && "bg-[#d4a574]",
        status !== "running" && status !== "crashed" && status !== "starting" && status !== "stopping" && "bg-muted-foreground/50",
      )}
      aria-hidden
    />
  );
}

function userInitials(label: string) {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return label.slice(0, 2).toUpperCase();
}

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const cachedAuth = getAuthSnapshot();
  const [auth, setAuth] = useState({
    permissions: cachedAuth?.permissions ?? null,
    userLabel: cachedAuth?.userLabel ?? null,
  });
  const [instances, setInstances] = useState<SidebarInstance[]>(getSidebarInstancesCache);

  const showGame = auth.permissions?.game !== false;
  const showInstances = auth.permissions?.instances !== false;

  useEffect(() => {
    void fetchAuthSnapshot().then(setAuth);
  }, []);

  useEffect(() => {
    if (!showInstances) return;
    void loadSidebarInstances(() => prefetchApi("instances") as Promise<SidebarInstance[]>).then(setInstances);
    const timer = setInterval(() => {
      void loadSidebarInstances(() => prefetchApi("instances") as Promise<SidebarInstance[]>)
        .then(setInstances)
        .catch(() => undefined);
    }, 30000);
    return () => clearInterval(timer);
  }, [showInstances]);

  const systemNav = useMemo(() => {
    const items: NavItem[] = [
      { href: "/help", label: "Hosting guide", icon: BookOpenIcon, match: (p) => p.startsWith("/help") },
    ];
    if (auth.permissions?.discord !== false) {
      items.push({ href: "/discord", label: "Discord", icon: BotIcon, match: (p) => p.startsWith("/discord") });
    }
    if (auth.permissions?.settings !== false) {
      items.push({ href: "/settings", label: "Settings", icon: WrenchIcon, match: (p) => p.startsWith("/settings") });
    }
    if (auth.permissions?.users) {
      items.push({ href: "/admin/users", label: "Users", icon: UsersIcon, match: (p) => p.startsWith("/admin/users") });
    }
    return items;
  }, [auth.permissions]);

  async function logout() {
    clearAuthSnapshot();
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  const userLabel = auth.userLabel ?? "Signed in";
  const liveInstances = useMemo(
    () => instances.filter((instance) => isInstanceLive(instance.status)),
    [instances],
  );

  return (
    <Sidebar collapsible="offcanvas" variant="sidebar">
      <SidebarHeader className="h-14 shrink-0 flex-row items-center border-b border-sidebar-border px-3 py-0">
        <div className="flex w-full items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <PanelSidebarBrand />
          </div>
          <HostAlertsMenu variant="sidebar" />
        </div>
      </SidebarHeader>

      <SidebarContent className="flex flex-1 flex-col overflow-hidden px-0 py-0">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Group label="Overview">
            <SideLink
              href="/"
              active={pathname === "/"}
              icon={SquareTerminalIcon}
              label="Dashboard"
            />
            <SideLink
              href="/metrics"
              active={pathname.startsWith("/metrics")}
              icon={BarChart3Icon}
              label="Metrics"
            />
          </Group>

          {(showInstances || showGame) && (
            <Group label="Host">
              {showInstances && (
                <SideLink
                  href="/instances/new"
                  active={pathname === "/instances/new"}
                  icon={PlusIcon}
                  label="New instance"
                />
              )}
              {showGame && (
                <>
                  <SideLink
                    href="/game"
                    active={pathname.startsWith("/game")}
                    icon={ImportIcon}
                    label="Game install"
                  />
                  <SideLink
                    href="/missions"
                    active={pathname.startsWith("/missions")}
                    icon={CompassIcon}
                    label="Missions"
                    onPrefetch={() => void prefetchApi("missions")}
                  />
                </>
              )}
            </Group>
          )}

          {showInstances && liveInstances.length > 0 && (
            <Group label={`Live (${liveInstances.length})`}>
              <div className="max-h-52 overflow-y-auto">
                {liveInstances.map((instance) => (
                  <Link
                    key={instance.id}
                    href={`/instances/${instance.id}`}
                    prefetch
                    title={`${instance.name} · port ${instance.config.publicPort}`}
                    onMouseEnter={() => {
                      router.prefetch(`/instances/${instance.id}`);
                      void prefetchApi(`instances/${instance.id}`);
                    }}
                    onFocus={() => {
                      router.prefetch(`/instances/${instance.id}`);
                      void prefetchApi(`instances/${instance.id}`);
                    }}
                    className={cn(
                      "flex h-9 items-center gap-2.5 px-3 text-[13px] transition-colors",
                      pathname.startsWith(`/instances/${instance.id}`)
                        ? "bg-secondary text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {statusDot(instance.status)}
                    <span className="min-w-0 flex-1 truncate">{instance.name}</span>
                  </Link>
                ))}
              </div>
            </Group>
          )}

          <Group label="System">
            {systemNav.map((item) => (
              <SideLink
                key={item.href}
                href={item.href}
                active={item.match(pathname)}
                icon={item.icon}
                label={item.label}
              />
            ))}
          </Group>
        </div>
      </SidebarContent>

      <SidebarFooter className="shrink-0 flex-col gap-0 border-t border-sidebar-border p-0">
        <div className="flex items-center gap-2.5 border-b border-sidebar-border px-3 py-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center bg-sidebar-accent font-mono text-[10px] font-medium text-sidebar-foreground">
            {userInitials(userLabel)}
          </div>
          <p className="min-w-0 flex-1 truncate text-xs text-sidebar-foreground">{userLabel}</p>
          <button
            type="button"
            onClick={() => void logout()}
            className="shrink-0 p-1 text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Log out"
          >
            <LogOutIcon className="size-4" strokeWidth={1.75} />
          </button>
        </div>
        <PanelSidebarFooterBrand />
      </SidebarFooter>
    </Sidebar>
  );
}

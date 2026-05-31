"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import {
  BarChart3Icon,
  PackagePlusIcon,
  CompassIcon,
  GlobeLockIcon,
  ImportIcon,
  LogOutIcon,
  BotIcon,
  SquareTerminalIcon,
  UsersIcon,
  WrenchIcon,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import type { PanelPermissions } from "@/lib/shared/permissions";
import { cn } from "@/lib/utils";
import { HostAlertsMenu } from "@/components/host-alerts-menu";

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

type AuthSnapshot = {
  permissions: PanelPermissions | null;
  userLabel: string | null;
};

let authSnapshot: AuthSnapshot | null = null;
let authRequest: Promise<AuthSnapshot> | null = null;

function fetchAuthSnapshot(): Promise<AuthSnapshot> {
  if (authSnapshot) return Promise.resolve(authSnapshot);
  if (authRequest) return authRequest;
  authRequest = fetch("/api/auth/me")
    .then((res) => (res.ok ? res.json() : null))
    .then((data: { name?: string; email?: string; permissions?: PanelPermissions } | null) => {
      const snapshot: AuthSnapshot = {
        permissions: data?.permissions ?? null,
        userLabel: data?.name || data?.email || null,
      };
      authSnapshot = snapshot;
      return snapshot;
    })
    .catch(() => {
      const snapshot: AuthSnapshot = { permissions: null, userLabel: null };
      authSnapshot = snapshot;
      return snapshot;
    })
    .finally(() => {
      authRequest = null;
    });
  return authRequest;
}

export function clearAuthSnapshot() {
  authSnapshot = null;
  authRequest = null;
}

export function useShellHeader(header: ShellHeaderState | null) {
  const context = useContext(ShellHeaderContext);
  if (!context) {
    throw new Error("useShellHeader must be used within Shell");
  }

  const { setHeader } = context;

  useEffect(() => {
    setHeader(header);
    return () => setHeader(null);
  }, [setHeader, header]);
}

function ShellHeaderProvider({ children }: { children: React.ReactNode }) {
  const [header, setHeader] = useState<ShellHeaderState | null>(null);

  return <ShellHeaderContext.Provider value={{ header, setHeader }}>{children}</ShellHeaderContext.Provider>;
}

const navGroups = [
  {
    label: "Overview",
    items: [
      { href: "/", label: "Dashboard", icon: SquareTerminalIcon },
      { href: "/metrics", label: "Metrics", icon: BarChart3Icon },
    ],
  },
  {
    label: "Servers",
    items: [
      { href: "/game", label: "Game Install", icon: ImportIcon },
      { href: "/instances/new", label: "New Instance", icon: PackagePlusIcon },
      { href: "/missions", label: "Missions", icon: CompassIcon },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/discord", label: "Discord", icon: BotIcon },
      { href: "/settings", label: "Settings", icon: WrenchIcon },
      { href: "/help", label: "Networking Help", icon: GlobeLockIcon },
    ],
  },
];

function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [auth, setAuth] = useState<AuthSnapshot>(() => authSnapshot ?? { permissions: null, userLabel: null });

  useEffect(() => {
    void fetchAuthSnapshot().then(setAuth);
  }, []);

  const { permissions, userLabel } = auth;

  const systemItems = [
    ...(permissions?.discord !== false ? [{ href: "/discord", label: "Discord", icon: BotIcon }] : []),
    ...(permissions?.settings !== false ? [{ href: "/settings", label: "Settings", icon: WrenchIcon }] : []),
    ...(permissions?.users ? [{ href: "/admin/users", label: "Users", icon: UsersIcon }] : []),
    { href: "/help", label: "Networking Help", icon: GlobeLockIcon },
  ];

  const navGroupsFiltered = navGroups.map((group) =>
    group.label === "System" ? { ...group, items: systemItems } : group,
  );

  async function logout() {
    clearAuthSnapshot();
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="h-14 shrink-0 border-b border-sidebar-border p-0 px-4">
        <div className="flex h-full items-center gap-3">
          <div className="flex size-8 shrink-0 items-center justify-center border border-sidebar-border bg-sidebar-accent text-xs font-semibold text-sidebar-foreground">
            R
          </div>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-semibold tracking-tight text-sidebar-foreground">Reforger Panel</p>
            <p className="truncate text-[11px] text-muted-foreground">Arma host console</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 py-3">
        {navGroupsFiltered.map((group, index) => (
          <SidebarGroup key={group.label} className={cn("px-2 py-1", index > 0 && "mt-1")}>
            <SidebarGroupLabel className="h-7 px-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {group.items.map((item) => {
                  const active = pathname === item.href;
                  const Icon = item.icon;
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={active} size="default" tooltip={item.label}>
                        <Link href={item.href}>
                          <Icon strokeWidth={1.85} className="size-4 shrink-0" />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border px-2 py-2">
        {userLabel && (
          <p className="truncate px-3 pb-2 text-[11px] text-muted-foreground">{userLabel}</p>
        )}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="default" tooltip="Logout" onClick={() => void logout()}>
              <LogOutIcon strokeWidth={1.75} />
              <span>Logout</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

function ShellHeader() {
  const { state } = useSidebar();
  const context = useContext(ShellHeaderContext);
  const header = context?.header;

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background px-4 lg:gap-4 lg:px-8">
      <SidebarTrigger className="-ml-1 shrink-0" aria-label={state === "collapsed" ? "Show navigation" : "Hide navigation"} />

      {header ? (
        <>
          <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-semibold text-foreground">{header.title}</p>
                {header.status && <StatusBadge status={header.status} />}
              </div>
              {header.meta && (
                <p className="truncate font-mono text-[10px] text-muted-foreground">{header.meta}</p>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <HostAlertsMenu />
            {header.actions && <div className="hidden sm:block">{header.actions}</div>}
          </div>
        </>
      ) : (
        <>
          {state === "collapsed" && (
            <p className="hidden text-sm text-muted-foreground md:block">Navigation hidden</p>
          )}
          <p className="font-mono text-xs text-muted-foreground md:hidden">
            <span className="text-foreground">reforger.panel</span>
          </p>
          <div className="ml-auto shrink-0">
            <HostAlertsMenu />
          </div>
        </>
      )}
    </header>
  );
}

function ShellHeaderSync({ header }: { header: ShellHeaderState | null }) {
  useShellHeader(header);
  return null;
}

export function Shell({
  children,
  contentClassName,
  header = null,
}: {
  children: React.ReactNode;
  contentClassName?: string;
  header?: ShellHeaderState | null;
}) {
  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "18rem",
          "--sidebar-width-mobile": "20rem",
        } as React.CSSProperties
      }
    >
      <AppSidebar />
      <ShellHeaderProvider>
        <ShellHeaderSync header={header} />
        <SidebarInset>
          <ShellHeader />

          <div className="flex-1 px-4 py-8 sm:px-8 lg:px-10 lg:py-10">
            <div className={cn("mx-auto max-w-5xl", contentClassName)}>{children}</div>
          </div>
        </SidebarInset>
      </ShellHeaderProvider>
    </SidebarProvider>
  );
}

export function Card({
  title,
  children,
  actions,
  className,
}: {
  title?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("border border-border bg-card", className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          {title ? <h2 className="text-sm font-medium text-foreground">{title}</h2> : <span />}
          {actions}
        </div>
      )}
      <div className={cn((title || actions) && "p-4")}>{children}</div>
    </section>
  );
}

export function Button({
  children,
  onClick,
  variant = "primary",
  disabled,
  type = "button",
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "danger" | "ghost";
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex items-center justify-center px-3 py-1.5 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-primary text-primary-foreground hover:bg-primary/90",
        variant === "danger" && "border border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/15",
        variant === "ghost" && "border border-border text-foreground hover:bg-secondary",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Input({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block space-y-2 text-sm">
      <span className="font-mono text-[11px] uppercase text-muted-foreground">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-input bg-background px-3 py-2 text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-foreground/30"
      />
    </label>
  );
}

export function TextArea({
  label,
  value,
  onChange,
  rows = 8,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <label className="block space-y-2 text-sm">
      <span className="font-mono text-[11px] uppercase text-muted-foreground">{label}</span>
      <textarea
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-input bg-background px-3 py-2 font-mono text-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-foreground/30"
      />
    </label>
  );
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/agent/${path}`, init);
  } catch {
    throw new ApiError("Cannot reach the panel backend. Is the web server running?", 0);
  }

  const text = await res.text();
  let data: unknown = null;
  if (text.trim()) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new ApiError(
        res.ok ? "Invalid response from server" : text.slice(0, 200) || `Request failed (${res.status})`,
        res.status,
      );
    }
  }

  if (!res.ok) {
    const payload = data as { error?: string; details?: unknown } | null;
    const msg = payload?.error ?? `Request failed (${res.status})`;
    throw new ApiError(msg, res.status, payload?.details);
  }

  if (res.status === 204 || data === null) return undefined as T;
  return data as T;
}

export function PageHeader({
  title,
  description,
  actions,
  label,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  label?: string;
}) {
  return (
    <div className="mb-10 border-b border-border pb-8">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          {label && <p className="font-mono text-[11px] text-muted-foreground">{label}</p>}
          <h2 className={cn("text-[1.75rem] font-semibold tracking-[-0.03em] text-foreground", label && "mt-2")}>
            {title}
          </h2>
          {description && <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </div>
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="px-5 py-4">
      <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-lg font-medium tracking-tight text-foreground">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function LinkButton({
  href,
  children,
  variant = "ghost",
}: {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "ghost";
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center justify-center px-3 py-1.5 text-[13px] font-medium transition-colors",
        variant === "primary" && "bg-primary text-primary-foreground hover:bg-primary/90",
        variant === "ghost" && "border border-border text-foreground hover:bg-secondary",
      )}
    >
      {children}
    </Link>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const running = status === "running";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide",
        running && "text-chart-1",
        status === "crashed" && "text-destructive",
        !running && status !== "crashed" && "text-muted-foreground",
      )}
    >
      {running && <span className="size-1.5 bg-chart-1" />}
      {status}
    </span>
  );
}

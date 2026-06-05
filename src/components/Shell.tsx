"use client";

import Link from "next/link";
import { invalidateApiCache, withApiCache } from "@/lib/panel-api-cache";
import { cn } from "@/lib/utils";
import { ShellHeaderSync } from "@/components/shell-header";
import type { ShellHeaderState } from "@/components/shell-header";

export { clearAuthSnapshot } from "@/lib/auth-client";
export { useShellHeader } from "@/components/shell-header";
export type { ShellHeaderState } from "@/components/shell-header";
export { StatusBadge } from "@/components/status-badge";

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
    <>
      <ShellHeaderSync header={header} />
      <div className={cn("mx-auto max-w-5xl", contentClassName)}>{children}</div>
    </>
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

async function fetchApi<T>(path: string, init?: RequestInit): Promise<T> {
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

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  const isRead = method === "GET" || method === "HEAD";

  if (!isRead) {
    if (path.startsWith("instances")) invalidateApiCache("instances");
    else invalidateApiCache(path.split("/")[0]);
    return fetchApi<T>(path, init);
  }

  return withApiCache(path, () => fetchApi<T>(path, init));
}

export function prefetchApi(path: string) {
  return withApiCache(path, () => fetchApi(path));
}

export function PageHeader({
  title,
  description,
  actions,
  label,
}: {
  title: string;
  description?: React.ReactNode;
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
          {description && (
            <div className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{description}</div>
          )}
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

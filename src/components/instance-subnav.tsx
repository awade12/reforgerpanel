"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const tabs = (id: string) => [
  {
    href: `/instances/${id}`,
    label: "Settings",
    match: (path: string) => path === `/instances/${id}`,
  },
  {
    href: `/instances/${id}/network`,
    label: "Network",
    match: (path: string) => path.startsWith(`/instances/${id}/network`),
  },
  {
    href: `/instances/${id}/mods`,
    label: "Mods",
    match: (path: string) => path.startsWith(`/instances/${id}/mods`),
  },
  {
    href: `/instances/${id}/players`,
    label: "Players",
    match: (path: string) => path.startsWith(`/instances/${id}/players`),
  },
  {
    href: `/instances/${id}/logs`,
    label: "Logs",
    match: (path: string) => path.startsWith(`/instances/${id}/logs`),
  },
  {
    href: `/instances/${id}/admin`,
    label: "Admin",
    match: (path: string) => path.startsWith(`/instances/${id}/admin`),
  },
];

export function InstanceSubnav({ id }: { id: string }) {
  const pathname = usePathname();

  return (
    <nav className="mb-8 flex flex-wrap gap-0 border-b border-border">
      {tabs(id).map((tab) => {
        const active = tab.match(pathname);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "-mb-px border-b-2 px-4 py-2.5 text-sm transition-colors",
              active
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

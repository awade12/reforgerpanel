"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { prefetchApi } from "@/components/Shell";

const ROUTES = ["/", "/metrics", "/game", "/missions", "/settings", "/discord", "/help", "/instances/new"];

const PREFETCH_PATHS = ["instances", "missions", "game/status", "settings"];

export function NavigationWarmup() {
  const router = useRouter();

  useEffect(() => {
    for (const href of ROUTES) router.prefetch(href);
    for (const path of PREFETCH_PATHS) void prefetchApi(path);
  }, [router]);

  return null;
}

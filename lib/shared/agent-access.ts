import type { PanelPermissions } from "./permissions";

export type AgentRoutePolicy = {
  permission: keyof PanelPermissions;
  write: boolean;
  instanceControl?: boolean;
};

export function agentRoutePolicy(pathname: string, method: string): AgentRoutePolicy | null {
  if (pathname.startsWith("/bot/")) return null;
  if (pathname === "/auth/logout" && method === "POST") {
    return { permission: "dashboard", write: false };
  }
  if (pathname === "/auth/logout-all" && method === "POST") {
    return { permission: "users", write: true };
  }
  if (pathname.startsWith("/auth/")) return { permission: "users", write: method !== "GET" };

  if (pathname === "/host" || pathname === "/host/status" || pathname === "/host/firewall") {
    return { permission: "dashboard", write: false };
  }
  if (pathname.startsWith("/game/")) {
    return { permission: "game", write: method !== "GET" };
  }
  if (pathname.startsWith("/missions")) {
    return { permission: "missions", write: method !== "GET" };
  }
  if (pathname.startsWith("/settings") || pathname.startsWith("/audit")) {
    return { permission: "settings", write: method !== "GET" };
  }
  if (pathname.startsWith("/scenarios") || pathname.startsWith("/workshop/")) {
    return { permission: "instances", write: false };
  }

  if (pathname === "/instances" && method === "GET") {
    return { permission: "instances", write: false };
  }
  if (pathname === "/instances" && method === "POST") {
    return { permission: "instances", write: true, instanceControl: true };
  }

  const instanceMatch = pathname.match(/^\/instances\/([^/]+)(\/.*)?$/);
  if (instanceMatch) {
    const sub = instanceMatch[2] ?? "";
    if (sub === "" && method === "DELETE") {
      return { permission: "instances", write: true, instanceControl: true };
    }
    if (sub === "/start" || sub === "/stop" || sub === "/restart") {
      return { permission: "instances", write: true, instanceControl: true };
    }
    if (sub === "/firewall" || sub === "/mods/download" || sub === "/battleye/repair") {
      return { permission: "instances", write: true };
    }
    if (sub === "/battleye" && method === "POST") {
      return { permission: "instances", write: true };
    }
    if (sub === "/bercon/command" && method === "POST") {
      return { permission: "instances", write: true };
    }
    if (sub === "/alerts/test" || sub === "/alerts/sync-status") {
      return { permission: "instances", write: true };
    }
    if (sub === "/merge-mission" && method === "POST") {
      return { permission: "missions", write: true };
    }
    if (sub === "/bot-status" && method === "PATCH") {
      return { permission: "discord", write: true };
    }
    return { permission: "instances", write: method !== "GET" };
  }

  return { permission: "dashboard", write: method !== "GET" };
}

export function panelMayAccess(policy: AgentRoutePolicy | null, permissions: PanelPermissions) {
  if (!policy) return true;
  return permissions[policy.permission];
}

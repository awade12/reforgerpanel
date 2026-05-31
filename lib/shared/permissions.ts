export type PanelRole = "master" | "admin" | "operator" | "viewer";

export type PanelPermissions = {
  dashboard: boolean;
  instances: boolean;
  missions: boolean;
  game: boolean;
  settings: boolean;
  discord: boolean;
  metrics: boolean;
  users: boolean;
};

export const ALL_PERMISSIONS: PanelPermissions = {
  dashboard: true,
  instances: true,
  missions: true,
  game: true,
  settings: true,
  discord: true,
  metrics: true,
  users: true,
};

const ROLE_DEFAULTS: Record<PanelRole, PanelPermissions> = {
  master: ALL_PERMISSIONS,
  admin: {
    dashboard: true,
    instances: true,
    missions: true,
    game: true,
    settings: true,
    discord: true,
    metrics: true,
    users: false,
  },
  operator: {
    dashboard: true,
    instances: true,
    missions: true,
    game: false,
    settings: false,
    discord: false,
    metrics: true,
    users: false,
  },
  viewer: {
    dashboard: true,
    instances: true,
    missions: true,
    game: false,
    settings: false,
    discord: false,
    metrics: true,
    users: false,
  },
};

export function permissionsForRole(role: PanelRole, override?: Partial<PanelPermissions> | null): PanelPermissions {
  const base = ROLE_DEFAULTS[role] ?? ROLE_DEFAULTS.viewer;
  if (!override) return { ...base };
  return { ...base, ...override };
}

export function routePermission(pathname: string): keyof PanelPermissions | null {
  if (pathname === "/" || pathname.startsWith("/instances")) return "instances";
  if (pathname.startsWith("/missions")) return "missions";
  if (pathname.startsWith("/game")) return "game";
  if (pathname.startsWith("/settings")) return "settings";
  if (pathname.startsWith("/discord")) return "discord";
  if (pathname.startsWith("/metrics")) return "metrics";
  if (pathname.startsWith("/admin/users")) return "users";
  return "dashboard";
}

export function canAccessPath(permissions: PanelPermissions, pathname: string) {
  const key = routePermission(pathname);
  if (!key) return true;
  return permissions[key];
}

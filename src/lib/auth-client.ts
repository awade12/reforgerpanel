import type { PanelPermissions } from "@/lib/shared/permissions";

export type AuthSnapshot = {
  permissions: PanelPermissions | null;
  userLabel: string | null;
};

let authSnapshot: AuthSnapshot | null = null;
let authRequest: Promise<AuthSnapshot> | null = null;

export function getAuthSnapshot(): AuthSnapshot | null {
  return authSnapshot;
}

export function clearAuthSnapshot() {
  authSnapshot = null;
  authRequest = null;
}

export function fetchAuthSnapshot(): Promise<AuthSnapshot> {
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

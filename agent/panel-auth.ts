import type http from "http";
import { HttpError } from "../lib/shared/http-error";
import { agentRoutePolicy, panelMayAccess } from "../lib/shared/agent-access";
import { ALL_PERMISSIONS, permissionsForRole, type PanelPermissions, type PanelRole } from "../lib/shared/permissions";
import { verifySessionToken } from "../lib/shared/session-token";
import { agentConfig } from "./config";
import { isPanelSessionValid, touchPanelSession } from "./db/sessions";
import { findUserById } from "./db/users";
import { isPanelClient, PANEL_SESSION_COOKIE, PANEL_SESSION_HEADER } from "./panel-request";

export type PanelAuthContext = {
  userId: string;
  sessionId: string;
  email: string;
  name: string;
  role: PanelRole;
  permissions: PanelPermissions;
  legacy: boolean;
};

function legacySessionSecret() {
  return (
    process.env.PANEL_SESSION_SECRET?.trim() ||
    process.env.SESSION_SECRET?.trim() ||
    process.env.AGENT_TOKEN?.trim() ||
    "change-me-session-secret"
  );
}

export async function resolvePanelAuth(req: http.IncomingMessage): Promise<PanelAuthContext | null> {
  if (!isPanelClient(req)) return null;

  const token =
    req.headers[PANEL_SESSION_HEADER]?.toString().trim() ||
    parseCookie(req.headers.cookie, PANEL_SESSION_COOKIE);

  if (!token) return null;

  if (token === legacySessionSecret()) {
    return {
      userId: "legacy",
      sessionId: "legacy",
      email: "admin@local",
      name: "Admin",
      role: "master",
      permissions: ALL_PERMISSIONS,
      legacy: true,
    };
  }

  const payload = await verifySessionToken(token);
  if (!payload) return null;

  const valid = await isPanelSessionValid(payload.sid, payload.sub);
  if (!valid) return null;

  const user = await findUserById(payload.sub);
  if (!user || user.disabled) return null;

  void touchPanelSession(payload.sid);

  return {
    userId: user.id,
    sessionId: payload.sid,
    email: user.email,
    name: user.name,
    role: user.role,
    permissions: user.permissions,
    legacy: false,
  };
}

function parseCookie(header: string | undefined, name: string) {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

export function agentTokenOk(req: http.IncomingMessage) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return token === agentConfig.token;
}

export function assertPanelRouteAccess(req: http.IncomingMessage, panel: PanelAuthContext, pathname: string, method: string) {
  const policy = agentRoutePolicy(pathname, method);
  if (!panelMayAccess(policy, panel.permissions)) {
    throw new HttpError(403, "Insufficient permissions");
  }
  if (policy?.instanceControl && panel.role === "viewer") {
    throw new HttpError(403, "Viewers cannot control instances");
  }
}

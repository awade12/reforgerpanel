import { addAudit } from "../db";
import { isLoginLocked, recordLoginAttempt } from "../db/login-guard";
import {
  createPanelSession,
  revokeAllSessions,
  revokeAllUserSessions,
  revokePanelSession,
} from "../db/sessions";
import { sendJson, type RequestContext } from "../http";

export async function handleAuthSessionRoutes(ctx: RequestContext): Promise<boolean> {
  const { pathname, method, panel, req } = ctx;
  if (!panel) return false;

  if (pathname === "/auth/logout" && method === "POST") {
    if (!panel.legacy) await revokePanelSession(panel.sessionId);
    addAudit("auth.logout", panel.email);
    sendJson(ctx.res, 200, { ok: true });
    return true;
  }

  if (pathname === "/auth/logout-all" && method === "POST") {
    if (panel.role !== "master") {
      sendJson(ctx.res, 403, { error: "Only master admin can revoke all sessions" });
      return true;
    }
    await revokeAllSessions();
    addAudit("auth.logout_all", panel.email);
    sendJson(ctx.res, 200, { ok: true });
    return true;
  }

  return false;
}

export function clientIp(req: import("http").IncomingMessage) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0]?.trim();
  return req.socket.remoteAddress ?? undefined;
}

export { isLoginLocked, recordLoginAttempt, createPanelSession, revokeAllUserSessions };

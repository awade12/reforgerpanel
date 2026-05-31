import type http from "http";
import { URL } from "url";
import { handlePublicAuthRoutes, handleAuthUserRoutes } from "./auth-handlers";
import { agentTokenOk, assertPanelRouteAccess, resolvePanelAuth } from "./panel-auth";
import { isPanelClient } from "./panel-request";
import { readBody, sendJson, handleRouteError, type RequestContext } from "./http";
import { handleHostRoutes } from "./routes/host";
import { handleInstanceRoutes } from "./routes/instances";
import { handleMissionRoutes } from "./routes/missions";
import { handleSettingsRoutes } from "./routes/settings";
import { handleBotRoutes } from "./routes/bot";
import { handleAuthSessionRoutes } from "./routes/auth";

const routeHandlers = [
  handleAuthSessionRoutes,
  handleHostRoutes,
  handleInstanceRoutes,
  handleMissionRoutes,
  handleSettingsRoutes,
  handleBotRoutes,
];

export async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  if (!req.url) return sendJson(res, 400, { error: "Bad request" });
  const url = new URL(req.url, `http://${req.headers.host}`);
  const { pathname } = url;
  const method = req.method ?? "GET";

  if (pathname === "/health") {
    return sendJson(res, 200, { ok: true, service: "reforgerpanel-agent" });
  }

  const publicAuth = await handlePublicAuthRoutes(req, res, pathname, method, () => readBody(req));
  if (publicAuth !== false) return;

  if (!agentTokenOk(req)) {
    return sendJson(res, 401, { error: "Unauthorized" });
  }

  let panel = null;
  if (isPanelClient(req)) {
    panel = await resolvePanelAuth(req);
    if (!panel) return sendJson(res, 401, { error: "Panel session required" });
    try {
      assertPanelRouteAccess(req, panel, pathname, method);
    } catch (err) {
      return handleRouteError(res, err);
    }
  }

  const ctx: RequestContext = {
    req,
    res,
    url,
    pathname,
    method,
    panel,
    readBody: () => readBody(req),
  };

  try {
    const authUsers = await handleAuthUserRoutes(req, res, pathname, method, () => readBody(req));
    if (authUsers !== false) return;

    for (const handler of routeHandlers) {
      if (await handler(ctx)) return;
    }
    return sendJson(res, 404, { error: "Not found" });
  } catch (err) {
    return handleRouteError(res, err);
  }
}

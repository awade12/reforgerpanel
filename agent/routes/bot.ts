import { recordBotHeartbeat } from "../db";
import { sendJson, type RequestContext } from "../http";

export async function handleBotRoutes(ctx: RequestContext) {
  const { pathname, method, res } = ctx;

  if (pathname === "/bot/heartbeat" && method === "POST") {
    const body = await ctx.readBody();
    recordBotHeartbeat({
      username: body.username ? String(body.username) : undefined,
      tag: body.tag ? String(body.tag) : undefined,
      deployedAt: body.deployedAt ? String(body.deployedAt) : undefined,
    });
    sendJson(res, 200, { ok: true });
    return true;
  }

  if (pathname === "/bot/status-embeds" && method === "GET") {
    const { listBotStatusEmbeds } = await import("../bot-runtime");
    sendJson(res, 200, await listBotStatusEmbeds());
    return true;
  }

  if (pathname === "/bot/dashboard" && method === "GET") {
    const { buildBotDashboardSync } = await import("../bot-dashboard");
    sendJson(res, 200, await buildBotDashboardSync());
    return true;
  }

  if (pathname === "/bot/dashboard" && method === "PATCH") {
    const body = await ctx.readBody();
    const { ackBotDashboard } = await import("../bot-dashboard");
    ackBotDashboard({
      crashPingInstanceIds: Array.isArray(body.crashPingInstanceIds)
        ? body.crashPingInstanceIds.map(String)
        : undefined,
      seedPingInstanceIds: Array.isArray(body.seedPingInstanceIds)
        ? body.seedPingInstanceIds.map(String)
        : undefined,
      maintenanceMessageId:
        body.maintenanceMessageId === undefined
          ? undefined
          : body.maintenanceMessageId == null || body.maintenanceMessageId === ""
            ? null
            : String(body.maintenanceMessageId),
    });
    sendJson(res, 200, { ok: true });
    return true;
  }

  return false;
}

import { getUsedPorts, nextFreePort } from "../db";
import { getHostInfo } from "../instances";
import { getHostStatus } from "../host-status";
import { getGameInstallStatus, getInstallJob, installOrUpdate, ensureReforgerDirs, startInstallJob, cancelInstallJob } from "../steamcmd";
import { firewallAvailable, ufwStatus } from "../firewall";
import { discoverScenariosAsync, ensureScenarioCache, getScenarios } from "../scenarios";
import { parseBranch, sendJson, type RequestContext } from "../http";

export async function handleHostRoutes(ctx: RequestContext) {
  const { pathname, method, res, url } = ctx;

  if (pathname === "/host" && method === "GET") {
    sendJson(res, 200, {
      ...getHostInfo(),
      usedPorts: getUsedPorts(),
      suggestedPort: nextFreePort(),
    });
    return true;
  }

  if (pathname === "/host/status" && method === "GET") {
    const quick = url.searchParams.get("quick") === "1";
    sendJson(res, 200, await getHostStatus({ quick }));
    return true;
  }

  if (pathname === "/host/firewall" && method === "GET") {
    sendJson(res, 200, { available: firewallAvailable(), status: ufwStatus() });
    return true;
  }

  if (pathname === "/game/status" && method === "GET") {
    sendJson(res, 200, getGameInstallStatus());
    return true;
  }

  if (pathname === "/game/install" && method === "GET") {
    sendJson(res, 200, getInstallJob());
    return true;
  }

  if (pathname === "/game/install" && method === "POST") {
    const body = await ctx.readBody();
    const branch = parseBranch(body.branch);
    const job = startInstallJob(branch);
    sendJson(res, 202, job);
    return true;
  }

  if (pathname === "/game/install/cancel" && method === "POST") {
    sendJson(res, 200, cancelInstallJob());
    return true;
  }

  if (pathname === "/game/install/sync" && method === "POST") {
    const body = await ctx.readBody();
    const branch = parseBranch(body.branch);
    ensureReforgerDirs();
    const lines: string[] = [];
    const result = await installOrUpdate(branch, (line) => lines.push(line));
    sendJson(res, 200, { ...result, lines, installed: getGameInstallStatus() });
    return true;
  }

  if (pathname === "/scenarios" && method === "GET") {
    const branch = (url.searchParams.get("branch") as "stable" | "experimental") ?? "stable";
    const refresh = url.searchParams.get("refresh") === "1";
    const scenarios = refresh ? await discoverScenariosAsync(branch) : getScenarios(branch);
    sendJson(res, 200, scenarios);
    return true;
  }

  if (pathname === "/workshop/lookup" && method === "GET") {
    const { lookupWorkshopInput } = await import("../workshop-catalog");
    const query = url.searchParams.get("url") ?? url.searchParams.get("id") ?? "";
    const result = await lookupWorkshopInput(query);
    sendJson(res, 200, result);
    return true;
  }

  return false;
}

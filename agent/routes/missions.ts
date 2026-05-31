import {
  listAllMissions,
  loadMissionMetaFromDisk,
  registerMission,
  removeMission,
  saveMissionUpload,
} from "../missions";
import { sendJson, type RequestContext } from "../http";

export async function handleMissionRoutes(ctx: RequestContext) {
  const { pathname, method, res } = ctx;

  if (pathname === "/missions" && method === "GET") {
    loadMissionMetaFromDisk();
    sendJson(res, 200, listAllMissions());
    return true;
  }

  if (pathname === "/missions" && method === "POST") {
    const body = await ctx.readBody();
    if (body.files) {
      const mission = saveMissionUpload(
        String(body.slug),
        String(body.title),
        String(body.scenarioId),
        (body.requiredMods as never) ?? [],
        body.files as Record<string, string>,
      );
      sendJson(res, 201, mission);
      return true;
    }
    const mission = registerMission({
      slug: String(body.slug),
      title: String(body.title),
      scenarioId: String(body.scenarioId),
      source: body.source === "Workshop" ? "Workshop" : body.source === "Arma Reforger" ? "Arma Reforger" : undefined,
      requiredMods: (body.requiredMods as never) ?? [],
      requiredModIds: (body.requiredModIds as string[]) ?? [],
    });
    sendJson(res, 201, mission);
    return true;
  }

  const missionMatch = pathname.match(/^\/missions\/([^/]+)$/);
  if (missionMatch && method === "DELETE") {
    removeMission(missionMatch[1]);
    sendJson(res, 200, { ok: true });
    return true;
  }

  return false;
}

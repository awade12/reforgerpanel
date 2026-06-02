import {
  createInstanceFromTemplate,
  deleteInstanceTemplate,
  getInstanceTemplate,
  listInstanceTemplates,
} from "../templates";
import { sendJson, type RequestContext } from "../http";

export async function handleTemplateRoutes(ctx: RequestContext): Promise<boolean> {
  const { pathname, method } = ctx;

  if (pathname === "/templates" && method === "GET") {
    sendJson(ctx.res, 200, listInstanceTemplates());
    return true;
  }

  const match = pathname.match(/^\/templates\/([^/]+)(\/create)?$/);
  if (!match) return false;

  const slug = match[1];

  if (match[2] === "/create" && method === "POST") {
    const body = await ctx.readBody();
    const created = createInstanceFromTemplate(slug, {
      name: String(body.name ?? "").trim() || "Reforger Server",
      publicPort: body.publicPort != null && body.publicPort !== "" ? Number(body.publicPort) : undefined,
      publicAddress: body.publicAddress ? String(body.publicAddress) : undefined,
    });
    sendJson(ctx.res, 201, created);
    return true;
  }

  if (method === "GET") {
    sendJson(ctx.res, 200, getInstanceTemplate(slug));
    return true;
  }

  if (method === "DELETE") {
    deleteInstanceTemplate(slug);
    sendJson(ctx.res, 200, { ok: true });
    return true;
  }

  return false;
}

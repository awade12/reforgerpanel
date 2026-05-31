import type http from "http";
import { z } from "zod";
import { HttpError } from "../lib/shared/http-error";
import { formatZodError } from "../lib/shared/config-schema";
import type { PanelAuthContext } from "./panel-auth";

export type JsonBody = Record<string, unknown>;

export function sendJson(res: http.ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

export async function readBody(req: http.IncomingMessage): Promise<JsonBody> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as JsonBody;
  } catch {
    throw new HttpError(400, "Request body must be valid JSON");
  }
}

export function parseBranch(value: unknown, fallback: "stable" | "experimental" = "stable") {
  if (value == null || value === "") return fallback;
  if (value === "stable" || value === "experimental") return value;
  throw new HttpError(400, "branch must be stable or experimental");
}

export type RequestContext = {
  req: http.IncomingMessage;
  res: http.ServerResponse;
  url: URL;
  pathname: string;
  method: string;
  panel: PanelAuthContext | null;
  readBody: () => Promise<JsonBody>;
};

export function handleRouteError(res: http.ServerResponse, err: unknown) {
  if (err instanceof HttpError) {
    return sendJson(res, err.status, { error: err.message });
  }
  if (err instanceof z.ZodError) {
    return sendJson(res, 400, { error: formatZodError(err) });
  }
  console.error("[agent]", err);
  return sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
}

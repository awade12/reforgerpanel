import { NextRequest, NextResponse } from "next/server";
import { AgentError, agentFetch } from "@/lib/agent-client";
import { isAuthenticated } from "@/lib/auth";
import { cookies } from "next/headers";
import { PANEL_SESSION_COOKIE } from "@/lib/session-config";

async function guard() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

function agentErrorResponse(err: unknown) {
  if (err instanceof AgentError) {
    return NextResponse.json({ error: err.message }, { status: err.status || 503 });
  }
  return NextResponse.json(
    { error: err instanceof Error ? err.message : "Agent request failed" },
    { status: 503 },
  );
}

async function proxy(req: NextRequest, path: string[], method: string, body?: string) {
  const suffix = path.join("/");
  const query = req.nextUrl.search;
  const jar = await cookies();
  const panelSession = jar.get(PANEL_SESSION_COOKIE)?.value;
  const data = await agentFetch(`/${suffix}${query}`, {
    method,
    body: body || undefined,
    panel: true,
    panelSession,
  });
  return NextResponse.json(data ?? { ok: true });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const denied = await guard();
  if (denied) return denied;
  try {
    const { path } = await ctx.params;
    return await proxy(req, path, "GET");
  } catch (err) {
    return agentErrorResponse(err);
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const denied = await guard();
  if (denied) return denied;
  try {
    const { path } = await ctx.params;
    const body = await req.text();
    return await proxy(req, path, "POST", body);
  } catch (err) {
    return agentErrorResponse(err);
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const denied = await guard();
  if (denied) return denied;
  try {
    const { path } = await ctx.params;
    const body = await req.text();
    return await proxy(req, path, "PATCH", body);
  } catch (err) {
    return agentErrorResponse(err);
  }
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const denied = await guard();
  if (denied) return denied;
  try {
    const { path } = await ctx.params;
    const body = await req.text();
    return await proxy(req, path, "PUT", body);
  } catch (err) {
    return agentErrorResponse(err);
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const denied = await guard();
  if (denied) return denied;
  try {
    const { path } = await ctx.params;
    return await proxy(req, path, "DELETE");
  } catch (err) {
    return agentErrorResponse(err);
  }
}

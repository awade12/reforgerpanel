import { NextRequest } from "next/server";
import { AGENT_TOKEN } from "@/lib/agent-client";
import { isAuthenticated } from "@/lib/auth";

const AGENT_URL = process.env.AGENT_URL ?? "http://127.0.0.1:9100";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAuthenticated())) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await ctx.params;
  const upstream = await fetch(`${AGENT_URL}/instances/${id}/logs/stream`, {
    headers: { Authorization: `Bearer ${AGENT_TOKEN}` },
    cache: "no-store",
  });

  if (!upstream.ok || !upstream.body) {
    return new Response("Stream unavailable", { status: upstream.status || 502 });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

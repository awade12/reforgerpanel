import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { agentFetch } from "@/lib/agent-client";
import { clearSessionCookie } from "@/lib/auth";
import { PANEL_SESSION_COOKIE } from "@/lib/session-config";

export async function POST() {
  const jar = await cookies();
  const panelSession = jar.get(PANEL_SESSION_COOKIE)?.value;
  if (panelSession) {
    try {
      await agentFetch("/auth/logout", { method: "POST", panel: true, panelSession });
    } catch {
      /* cookie cleared below even if agent is down */
    }
  }
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}

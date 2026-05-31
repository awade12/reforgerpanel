import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { PANEL_SESSION_COOKIE } from "@/lib/session-config";
import { ALL_PERMISSIONS } from "@/lib/shared/permissions";

function legacySessionSecret() {
  return (
    process.env.PANEL_SESSION_SECRET ??
    process.env.SESSION_SECRET ??
    process.env.AGENT_TOKEN ??
    "change-me-session-secret"
  );
}

export async function GET() {
  const session = await getSession();
  if (session) {
    return NextResponse.json({
      id: session.sub,
      email: session.email,
      name: session.name,
      role: session.role,
      permissions: session.permissions,
    });
  }

  const jar = await cookies();
  const token = jar.get(PANEL_SESSION_COOKIE)?.value;
  if (token === legacySessionSecret()) {
    return NextResponse.json({
      id: "legacy",
      email: "admin@local",
      name: "Admin",
      role: "master",
      permissions: ALL_PERMISSIONS,
    });
  }

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

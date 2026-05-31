import { NextRequest, NextResponse } from "next/server";
import { checkPassword, setLegacySessionCookie, setSessionCookie } from "@/lib/auth";
import { publicAgentFetch } from "@/lib/public-agent-client";

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { email?: string; password?: string };

  if (body.email) {
    try {
      const status = await publicAgentFetch<{ legacyPassword: boolean; needsSetup: boolean }>("/auth/setup-status");
      if (status.needsSetup) {
        return NextResponse.json({ error: "Complete setup first" }, { status: 409 });
      }
      if (status.legacyPassword) {
        return NextResponse.json({ error: "PostgreSQL is required for email login" }, { status: 400 });
      }
      const result = await publicAgentFetch<{ token: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: body.email, password: body.password ?? "" }),
      });
      await setSessionCookie(result.token);
      return NextResponse.json({ ok: true });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Invalid email or password" },
        { status: 401 },
      );
    }
  }

  if (!checkPassword(body.password ?? "")) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }
  await setLegacySessionCookie();
  return NextResponse.json({ ok: true });
}

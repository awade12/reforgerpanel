import { NextRequest, NextResponse } from "next/server";
import { publicAgentFetch } from "@/lib/public-agent-client";
import { setSessionCookie } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { email?: string; name?: string; password?: string };
  try {
    const result = await publicAgentFetch<{ token: string }>("/auth/bootstrap", {
      method: "POST",
      body: JSON.stringify(body),
    });
    await setSessionCookie(result.token);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Setup failed" },
      { status: 400 },
    );
  }
}

import { NextResponse } from "next/server";
import { publicAgentFetch } from "@/lib/public-agent-client";

export async function GET() {
  try {
    const status = await publicAgentFetch<{
      postgres: boolean;
      needsSetup: boolean;
      legacyPassword: boolean;
    }>("/auth/setup-status");
    return NextResponse.json(status);
  } catch {
    return NextResponse.json({ postgres: false, needsSetup: false, legacyPassword: true });
  }
}

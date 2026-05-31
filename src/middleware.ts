import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionFromCookie, verifySessionCookie } from "@/lib/auth-edge";
import { canAccessPath } from "@/lib/shared/permissions";

const publicPaths = ["/login", "/setup", "/api/auth/login", "/api/auth/bootstrap", "/api/auth/setup-status"];

async function setupNeeded() {
  try {
    const agentUrl = process.env.AGENT_URL ?? "http://127.0.0.1:9100";
    const res = await fetch(`${agentUrl}/auth/setup-status`, { cache: "no-store" });
    if (!res.ok) return false;
    const data = (await res.json()) as { needsSetup?: boolean };
    return Boolean(data.needsSetup);
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (publicPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon")) {
    return NextResponse.next();
  }

  const token = req.cookies.get("reforgerpanel_session")?.value;
  const authed = await verifySessionCookie(token);
  if (!authed) {
    if (await setupNeeded()) {
      return NextResponse.redirect(new URL("/setup", req.url));
    }
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const session = await getSessionFromCookie(token);
  if (session && !canAccessPath(session.permissions, pathname)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.png$).*)"],
};

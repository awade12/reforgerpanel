import { cookies } from "next/headers";
import { PANEL_SESSION_COOKIE, cookieSecureFlag } from "./session-config";
import { verifySessionToken } from "@/lib/shared/session-token";
import type { SessionPayload } from "@/lib/shared/session-token";

const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

export async function getSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(PANEL_SESSION_COOKIE)?.value;
  return verifySessionToken(token);
}

export async function isAuthenticated() {
  const session = await getSession();
  if (session) return true;

  const jar = await cookies();
  const token = jar.get(PANEL_SESSION_COOKIE)?.value;
  if (!token) return false;

  return token === legacySessionSecret();
}

function legacySessionSecret() {
  return (
    process.env.PANEL_SESSION_SECRET ??
    process.env.SESSION_SECRET ??
    process.env.AGENT_TOKEN ??
    "change-me-session-secret"
  );
}

export async function setSessionCookie(token: string) {
  const jar = await cookies();
  jar.set(PANEL_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecureFlag(),
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function setLegacySessionCookie() {
  await setSessionCookie(legacySessionSecret());
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(PANEL_SESSION_COOKIE);
}

export function checkPassword(password: string) {
  return password === (process.env.ADMIN_PASSWORD ?? "admin");
}

export async function verifySessionCookie(value: string | undefined) {
  if (!value) return false;
  const session = await verifySessionToken(value);
  if (session) return true;
  return value === legacySessionSecret();
}

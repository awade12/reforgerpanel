import { verifySessionToken } from "@/lib/shared/session-token";

function legacySessionSecret(env: NodeJS.ProcessEnv = process.env) {
  return (
    env.PANEL_SESSION_SECRET?.trim() ||
    env.SESSION_SECRET?.trim() ||
    env.AGENT_TOKEN?.trim() ||
    "change-me-session-secret"
  );
}

export async function verifySessionCookie(value: string | undefined) {
  if (!value) return false;
  const session = await verifySessionToken(value);
  if (session) return true;
  return value === legacySessionSecret();
}

export async function getSessionFromCookie(value: string | undefined) {
  if (!value) return null;
  return verifySessionToken(value);
}

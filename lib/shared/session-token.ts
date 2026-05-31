import type { PanelPermissions, PanelRole } from "./permissions";
import { permissionsForRole } from "./permissions";

export type SessionPayload = {
  sub: string;
  sid: string;
  email: string;
  name: string;
  role: PanelRole;
  permissions: PanelPermissions;
  exp: number;
};

const DEFAULT_MAX_AGE_SEC = 60 * 60 * 24 * 7;

function sessionSecret(env: NodeJS.ProcessEnv = process.env) {
  return (
    env.PANEL_SESSION_SECRET?.trim() ||
    env.SESSION_SECRET?.trim() ||
    env.AGENT_TOKEN?.trim() ||
    "change-me-session-secret"
  );
}

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmacSign(message: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return toBase64Url(new Uint8Array(sig));
}

async function hmacVerify(message: string, signature: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify("HMAC", key, fromBase64Url(signature), new TextEncoder().encode(message));
}

export async function signSessionToken(
  input: {
    userId: string;
    sessionId: string;
    email: string;
    name: string;
    role: PanelRole;
    permissions?: Partial<PanelPermissions> | null;
  },
  maxAgeSec = DEFAULT_MAX_AGE_SEC,
  env: NodeJS.ProcessEnv = process.env,
) {
  const payload: SessionPayload = {
    sub: input.userId,
    sid: input.sessionId,
    email: input.email,
    name: input.name,
    role: input.role,
    permissions: permissionsForRole(input.role, input.permissions),
    exp: Math.floor(Date.now() / 1000) + maxAgeSec,
  };
  const body = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await hmacSign(body, sessionSecret(env));
  return `${body}.${sig}`;
}

export async function verifySessionToken(token: string | undefined, env: NodeJS.ProcessEnv = process.env) {
  if (!token?.includes(".")) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const valid = await hmacVerify(body, sig, sessionSecret(env));
  if (!valid) return null;
  try {
    const json = new TextDecoder().decode(fromBase64Url(body));
    const payload = JSON.parse(json) as SessionPayload;
    if (!payload.sub || !payload.sid || !payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    payload.permissions = permissionsForRole(payload.role, payload.permissions);
    return payload;
  } catch {
    return null;
  }
}

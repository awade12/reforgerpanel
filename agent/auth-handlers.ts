import type http from "http";
import { z } from "zod";
import { HttpError } from "../lib/shared/http-error";
import { signSessionToken } from "../lib/shared/session-token";
import type { PanelRole } from "../lib/shared/permissions";
import {
  bootstrapMasterUser,
  createUser,
  deleteUser,
  findUserById,
  listUsers,
  needsSetup,
  updateUser,
  usersAvailable,
  verifyUserPassword,
} from "./db/users";
import { addAudit } from "./db";
import { createPanelSession, revokeAllUserSessions } from "./db/sessions";
import { clientIp, isLoginLocked, recordLoginAttempt } from "./routes/auth";

type JsonBody = Record<string, unknown>;

function sendJson(res: http.ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

const emailSchema = z.string().email().max(320);
const passwordSchema = z.string().min(8).max(256);
const roleSchema = z.enum(["master", "admin", "operator", "viewer"]);

function publicUser(user: Awaited<ReturnType<typeof findUserById>>) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    permissions: user.permissions,
    disabled: user.disabled,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastLoginAt: user.lastLoginAt,
  };
}

export async function handlePublicAuthRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  method: string,
  readBody: () => Promise<JsonBody>,
) {
  if (pathname === "/auth/setup-status" && method === "GET") {
    const postgres = usersAvailable();
    const setupNeeded = postgres ? await needsSetup() : false;
    return sendJson(res, 200, {
      postgres,
      needsSetup: setupNeeded,
      legacyPassword: !postgres,
    });
  }

  if (pathname === "/auth/bootstrap" && method === "POST") {
    if (!usersAvailable()) return sendJson(res, 400, { error: "PostgreSQL is required for account setup" });
    if (!(await needsSetup())) return sendJson(res, 409, { error: "Setup already completed" });
    const body = await readBody();
    const parsed = z
      .object({
        email: emailSchema,
        name: z.string().max(120).optional(),
        password: passwordSchema,
      })
      .safeParse(body);
    if (!parsed.success) return sendJson(res, 400, { error: "Invalid email or password (min 8 characters)" });
    const user = await bootstrapMasterUser({
      email: parsed.data.email,
      name: parsed.data.name?.trim() || "Master Admin",
      password: parsed.data.password,
    });
    addAudit("auth.bootstrap", `Master admin created: ${user.email}`);
    const session = await createPanelSession(user.id);
    const token = await signSessionToken({
      userId: user.id,
      sessionId: session.id,
      email: user.email,
      name: user.name,
      role: user.role,
      permissions: user.permissions,
    });
    return sendJson(res, 201, { user: publicUser(user), token });
  }

  if (pathname === "/auth/login" && method === "POST") {
    if (!usersAvailable()) return sendJson(res, 400, { error: "Use legacy password login" });
    const body = await readBody();
    const parsed = z
      .object({
        email: emailSchema,
        password: z.string().min(1).max(256),
      })
      .safeParse(body);
    if (!parsed.success) return sendJson(res, 400, { error: "Invalid credentials" });
    const email = parsed.data.email;
    if (await isLoginLocked(email)) {
      return sendJson(res, 429, { error: "Too many failed login attempts. Try again in 15 minutes." });
    }
    const user = await verifyUserPassword(email, parsed.data.password);
    if (!user) {
      await recordLoginAttempt(email, false, clientIp(req));
      return sendJson(res, 401, { error: "Invalid email or password" });
    }
    await recordLoginAttempt(email, true, clientIp(req));
    addAudit("auth.login", user.email);
    const session = await createPanelSession(user.id);
    const token = await signSessionToken({
      userId: user.id,
      sessionId: session.id,
      email: user.email,
      name: user.name,
      role: user.role,
      permissions: user.permissions,
    });
    return sendJson(res, 200, { user: publicUser(user), token });
  }

  return false;
}

export async function handleAuthUserRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  method: string,
  readBody: () => Promise<JsonBody>,
) {
  if (pathname === "/auth/users" && method === "GET") {
    if (!usersAvailable()) return sendJson(res, 400, { error: "PostgreSQL is required" });
    const users = await listUsers();
    return sendJson(res, 200, users.map((user) => publicUser(user)));
  }

  if (pathname === "/auth/users" && method === "POST") {
    if (!usersAvailable()) return sendJson(res, 400, { error: "PostgreSQL is required" });
    const body = await readBody();
    const parsed = z
      .object({
        email: emailSchema,
        name: z.string().max(120).optional(),
        password: passwordSchema,
        role: roleSchema,
      })
      .safeParse(body);
    if (!parsed.success) return sendJson(res, 400, { error: "Invalid user details" });
    const user = await createUser({
      email: parsed.data.email,
      name: parsed.data.name?.trim() || parsed.data.email.split("@")[0],
      password: parsed.data.password,
      role: parsed.data.role as PanelRole,
    });
    addAudit("auth.user.create", `${user.email} (${user.role})`);
    return sendJson(res, 201, publicUser(user));
  }

  const userMatch = pathname.match(/^\/auth\/users\/([^/]+)$/);
  if (userMatch && method === "PATCH") {
    if (!usersAvailable()) return sendJson(res, 400, { error: "PostgreSQL is required" });
    const body = await readBody();
    const parsed = z
      .object({
        email: emailSchema.optional(),
        name: z.string().max(120).optional(),
        password: passwordSchema.optional(),
        role: roleSchema.optional(),
        disabled: z.boolean().optional(),
      })
      .safeParse(body);
    if (!parsed.success) return sendJson(res, 400, { error: "Invalid user update" });
    try {
      const user = await updateUser(userMatch[1], parsed.data);
      if (parsed.data.disabled) await revokeAllUserSessions(user.id);
      addAudit("auth.user.update", user.email);
      return sendJson(res, 200, publicUser(user));
    } catch (err) {
      throw new HttpError(400, err instanceof Error ? err.message : "Update failed");
    }
  }

  if (userMatch && method === "DELETE") {
    if (!usersAvailable()) return sendJson(res, 400, { error: "PostgreSQL is required" });
    try {
      const existing = await findUserById(userMatch[1]);
      if (!existing) return sendJson(res, 404, { error: "User not found" });
      await revokeAllUserSessions(userMatch[1]);
      await deleteUser(userMatch[1]);
      addAudit("auth.user.delete", existing.email);
      return sendJson(res, 200, { ok: true });
    } catch (err) {
      throw new HttpError(400, err instanceof Error ? err.message : "Delete failed");
    }
  }

  return false;
}

import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import type { PanelPermissions, PanelRole } from "../../lib/shared/permissions";
import { permissionsForRole } from "../../lib/shared/permissions";
import { getPool, usePostgres } from "./postgres";

export type UserRecord = {
  id: string;
  email: string;
  name: string;
  role: PanelRole;
  permissions: PanelPermissions;
  disabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
};

function rowToUser(row: Record<string, unknown>): UserRecord {
  const role = String(row.role) as PanelRole;
  const override =
    row.permissions && typeof row.permissions === "object" ? (row.permissions as Partial<PanelPermissions>) : null;
  return {
    id: String(row.id),
    email: String(row.email),
    name: String(row.name ?? ""),
    role,
    permissions: permissionsForRole(role, override),
    disabled: Boolean(row.disabled),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
    lastLoginAt: row.last_login_at ? new Date(String(row.last_login_at)).toISOString() : null,
  };
}

export function usersAvailable() {
  return usePostgres();
}

export async function countUsers() {
  if (!usePostgres()) return 0;
  const res = await getPool().query("SELECT COUNT(*)::int AS count FROM users");
  return Number(res.rows[0]?.count ?? 0);
}

export async function needsSetup() {
  if (!usePostgres()) return false;
  return (await countUsers()) === 0;
}

export async function findUserByEmail(email: string) {
  if (!usePostgres()) return null;
  const res = await getPool().query("SELECT * FROM users WHERE lower(email) = lower($1) LIMIT 1", [email.trim()]);
  return res.rows[0] ? rowToUser(res.rows[0]) : null;
}

export async function findUserById(id: string) {
  if (!usePostgres()) return null;
  const res = await getPool().query("SELECT * FROM users WHERE id = $1 LIMIT 1", [id]);
  return res.rows[0] ? rowToUser(res.rows[0]) : null;
}

export async function findUserWithPassword(email: string) {
  if (!usePostgres()) return null;
  const res = await getPool().query("SELECT * FROM users WHERE lower(email) = lower($1) LIMIT 1", [email.trim()]);
  if (!res.rows[0]) return null;
  return {
    user: rowToUser(res.rows[0]),
    passwordHash: String(res.rows[0].password_hash),
  };
}

export async function listUsers() {
  if (!usePostgres()) return [];
  const res = await getPool().query("SELECT * FROM users ORDER BY created_at ASC");
  return res.rows.map((row) => rowToUser(row));
}

export async function createUser(input: {
  email: string;
  name: string;
  password: string;
  role: PanelRole;
  permissions?: Partial<PanelPermissions> | null;
}) {
  if (!usePostgres()) throw new Error("PostgreSQL is required for user accounts");
  const now = new Date().toISOString();
  const id = uuidv4();
  const passwordHash = await bcrypt.hash(input.password, 12);
  const permissions = permissionsForRole(input.role, input.permissions ?? null);
  await getPool().query(
    `INSERT INTO users (id, email, name, password_hash, role, permissions, disabled, created_at, updated_at, last_login_at)
     VALUES ($1,$2,$3,$4,$5,$6,false,$7,$7,NULL)`,
    [id, input.email.trim().toLowerCase(), input.name.trim(), passwordHash, input.role, JSON.stringify(permissions), now],
  );
  const user = await findUserById(id);
  if (!user) throw new Error("Failed to create user");
  return user;
}

export async function bootstrapMasterUser(input: { email: string; name: string; password: string }) {
  if (!usePostgres()) throw new Error("PostgreSQL is required for user accounts");
  if ((await countUsers()) > 0) throw new Error("Setup already completed");
  return createUser({
    email: input.email,
    name: input.name || "Master Admin",
    password: input.password,
    role: "master",
  });
}

export async function verifyUserPassword(email: string, password: string) {
  const row = await findUserWithPassword(email);
  if (!row || row.user.disabled) return null;
  const ok = await bcrypt.compare(password, row.passwordHash);
  if (!ok) return null;
  await getPool().query("UPDATE users SET last_login_at = $2, updated_at = $2 WHERE id = $1", [
    row.user.id,
    new Date().toISOString(),
  ]);
  return row.user;
}

export async function updateUser(
  id: string,
  patch: {
    email?: string;
    name?: string;
    password?: string;
    role?: PanelRole;
    permissions?: Partial<PanelPermissions> | null;
    disabled?: boolean;
  },
) {
  if (!usePostgres()) throw new Error("PostgreSQL is required for user accounts");
  const existing = await findUserById(id);
  if (!existing) throw new Error("User not found");
  if (existing.role === "master" && patch.role && patch.role !== "master") {
    throw new Error("Cannot change the master admin role");
  }
  if (existing.role === "master" && patch.disabled) {
    throw new Error("Cannot disable the master admin");
  }

  const now = new Date().toISOString();
  const role = patch.role ?? existing.role;
  const permissions = patch.permissions
    ? permissionsForRole(role, patch.permissions)
    : patch.role
      ? permissionsForRole(role)
      : existing.permissions;

  const fields: string[] = ["updated_at = $2"];
  const values: unknown[] = [id, now];
  let idx = 3;

  if (patch.email !== undefined) {
    fields.push(`email = $${idx++}`);
    values.push(patch.email.trim().toLowerCase());
  }
  if (patch.name !== undefined) {
    fields.push(`name = $${idx++}`);
    values.push(patch.name.trim());
  }
  if (patch.role !== undefined) {
    fields.push(`role = $${idx++}`);
    values.push(patch.role);
  }
  if (patch.permissions !== undefined || patch.role !== undefined) {
    fields.push(`permissions = $${idx++}`);
    values.push(JSON.stringify(permissions));
  }
  if (patch.disabled !== undefined) {
    fields.push(`disabled = $${idx++}`);
    values.push(patch.disabled);
  }
  if (patch.password) {
    fields.push(`password_hash = $${idx++}`);
    values.push(await bcrypt.hash(patch.password, 12));
  }

  await getPool().query(`UPDATE users SET ${fields.join(", ")} WHERE id = $1`, values);
  const user = await findUserById(id);
  if (!user) throw new Error("User not found");
  return user;
}

export async function deleteUser(id: string) {
  if (!usePostgres()) throw new Error("PostgreSQL is required for user accounts");
  const existing = await findUserById(id);
  if (!existing) throw new Error("User not found");
  if (existing.role === "master") throw new Error("Cannot delete the master admin");
  await getPool().query("DELETE FROM users WHERE id = $1", [id]);
}

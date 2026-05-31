import { v4 as uuidv4 } from "uuid";
import { getPool, usePostgres } from "./postgres";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function createPanelSession(userId: string) {
  if (!usePostgres()) return { id: uuidv4(), userId, expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString() };
  const id = uuidv4();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await getPool().query(
    `INSERT INTO panel_sessions (id, user_id, created_at, expires_at, revoked_at, last_seen_at)
     VALUES ($1,$2,$3,$4,NULL,$3)`,
    [id, userId, now.toISOString(), expiresAt.toISOString()],
  );
  return { id, userId, expiresAt: expiresAt.toISOString() };
}

export async function touchPanelSession(sessionId: string) {
  if (!usePostgres()) return;
  await getPool().query(`UPDATE panel_sessions SET last_seen_at = $2 WHERE id = $1 AND revoked_at IS NULL`, [
    sessionId,
    new Date().toISOString(),
  ]);
}

export async function isPanelSessionValid(sessionId: string, userId: string) {
  if (!usePostgres()) return true;
  const res = await getPool().query(
    `SELECT id FROM panel_sessions
     WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL AND expires_at > NOW()`,
    [sessionId, userId],
  );
  return res.rowCount > 0;
}

export async function revokePanelSession(sessionId: string) {
  if (!usePostgres()) return;
  await getPool().query(`UPDATE panel_sessions SET revoked_at = $2 WHERE id = $1 AND revoked_at IS NULL`, [
    sessionId,
    new Date().toISOString(),
  ]);
}

export async function revokeAllUserSessions(userId: string) {
  if (!usePostgres()) return;
  await getPool().query(
    `UPDATE panel_sessions SET revoked_at = $2 WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId, new Date().toISOString()],
  );
}

export async function revokeAllSessions() {
  if (!usePostgres()) return;
  await getPool().query(`UPDATE panel_sessions SET revoked_at = $1 WHERE revoked_at IS NULL`, [
    new Date().toISOString(),
  ]);
}

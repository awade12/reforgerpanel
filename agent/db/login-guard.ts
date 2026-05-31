import { getPool, usePostgres } from "./postgres";

const MAX_FAILURES = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const WINDOW_MS = 30 * 60 * 1000;

const memoryAttempts = new Map<string, { failures: number; lockedUntil: number }>();

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function isLoginLocked(email: string) {
  const key = normalizeEmail(email);
  const mem = memoryAttempts.get(key);
  if (mem && mem.lockedUntil > Date.now()) return true;
  if (!usePostgres()) return false;

  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const res = await getPool().query(
    `SELECT COUNT(*)::int AS failures FROM login_attempts
     WHERE email = $1 AND success = FALSE AND attempted_at >= $2`,
    [key, since],
  );
  return Number(res.rows[0]?.failures ?? 0) >= MAX_FAILURES;
}

export async function recordLoginAttempt(email: string, success: boolean, ip?: string) {
  const key = normalizeEmail(email);
  if (!success) {
    const mem = memoryAttempts.get(key) ?? { failures: 0, lockedUntil: 0 };
    mem.failures += 1;
    if (mem.failures >= MAX_FAILURES) mem.lockedUntil = Date.now() + LOCKOUT_MS;
    memoryAttempts.set(key, mem);
  } else {
    memoryAttempts.delete(key);
  }

  if (!usePostgres()) return;
  await getPool().query(`INSERT INTO login_attempts (email, attempted_at, success, ip) VALUES ($1,$2,$3,$4)`, [
    key,
    new Date().toISOString(),
    success,
    ip ?? null,
  ]);
}

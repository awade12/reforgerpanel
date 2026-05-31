export type GameUpdateTrigger = "scheduled" | "manual";

export type GameUpdateJobState = {
  running: boolean;
  trigger: GameUpdateTrigger | null;
  ok: boolean | null;
  lines: string[];
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  branches: string[];
  restartedInstances: string[];
  stoppedInstances: string[];
  nextScheduledAt: string | null;
};

export function matchesSimpleCron(expr: string, now = new Date()): boolean {
  const parts = expr.trim().split(/\s+/);
  if (parts.length < 2) return false;
  const minute = parts[0];
  const hour = parts[1];
  const dayOfWeek = parts.length >= 5 ? parts[4] : "*";
  const minuteOk = minute === "*" || Number(minute) === now.getUTCMinutes();
  const hourOk = hour === "*" || Number(hour) === now.getUTCHours();
  const dowOk = dayOfWeek === "*" || Number(dayOfWeek) === now.getUTCDay();
  return minuteOk && hourOk && dowOk && now.getUTCSeconds() < 5;
}

export function cronRunKey(expr: string, now = new Date()) {
  return `${now.toISOString().slice(0, 10)}T${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}:${expr.trim()}`;
}

export function describeNextCronRun(expr: string, now = new Date()): string | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const minute = parts[0];
  const hour = parts[1];
  const dayOfWeek = parts.length >= 5 ? parts[4] : "*";
  if (minute === "*" || hour === "*") return null;

  const targetMinute = Number(minute);
  const targetHour = Number(hour);
  if (!Number.isInteger(targetMinute) || !Number.isInteger(targetHour)) return null;

  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), targetHour, targetMinute, 0, 0));
  if (dayOfWeek !== "*") {
    const targetDow = Number(dayOfWeek);
    if (!Number.isInteger(targetDow)) return null;
    while (next.getUTCDay() !== targetDow || next.getTime() <= now.getTime()) {
      next.setUTCDate(next.getUTCDate() + 1);
    }
  } else if (next.getTime() <= now.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next.toISOString();
}

export function branchesForInstances(branches: string[]) {
  const set = new Set<string>(["stable"]);
  for (const branch of branches) {
    if (branch === "experimental") set.add("experimental");
  }
  return [...set] as ("stable" | "experimental")[];
}

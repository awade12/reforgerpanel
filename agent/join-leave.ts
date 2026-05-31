import fs from "fs";
import { findLatestLogFile } from "./logs";

const JOIN_PATTERNS = [
  /player\s+(?:connected|joined|connecting)/i,
  /connected\s+player/i,
  /join(?:ed|ing)\s+player/i,
];

const LEAVE_PATTERNS = [/player\s+(?:disconnected|left|disconnecting)/i, /disconnect(?:ed|ing)\s+player/i];

export type JoinLeaveEvent = {
  type: "join" | "leave";
  line: string;
  at: string;
};

export function parseJoinLeaveEvents(profilePath: string, sinceMs = 30_000): JoinLeaveEvent[] {
  const file = findLatestLogFile(profilePath);
  if (!file) return [];
  const content = fs.readFileSync(file, "utf8").slice(-12000);
  const lines = content.split("\n");
  const events: JoinLeaveEvent[] = [];
  const cutoff = Date.now() - sinceMs;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (JOIN_PATTERNS.some((pattern) => pattern.test(trimmed))) {
      events.push({ type: "join", line: trimmed, at: new Date().toISOString() });
    } else if (LEAVE_PATTERNS.some((pattern) => pattern.test(trimmed))) {
      events.push({ type: "leave", line: trimmed, at: new Date().toISOString() });
    }
  }

  return events.filter((_, index) => index >= Math.max(0, events.length - 20));
}

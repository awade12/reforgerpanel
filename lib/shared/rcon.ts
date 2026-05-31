export type RconPlayer = {
  id: number;
  name: string;
  guid: string;
  ping: number;
};

export function formatRconOutput(raw: string): string {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.includes("Logged In!") && !line.startsWith("Processing Command:"))
    .join("\n");
}

export function formatPlayersForDisplay(raw: string): string {
  const cleaned = formatRconOutput(raw);
  if (!cleaned || /^Players on server:/i.test(cleaned)) {
    return "No players connected.";
  }
  return cleaned;
}

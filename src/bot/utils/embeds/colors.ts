export const brandColor = 0x5c9fd4;

export function statusColor(status: string) {
  if (status === "running") return 0x5c9fd4;
  if (status === "crashed") return 0xd46a5a;
  if (status === "starting" || status === "stopping") return 0xd4a574;
  return 0x5a6270;
}

export function statusLabel(status: string) {
  const map: Record<string, string> = {
    running: "Online",
    crashed: "Crashed",
    stopped: "Offline",
    starting: "Starting",
    stopping: "Stopping",
    updating: "Updating",
  };
  return map[status] ?? status;
}

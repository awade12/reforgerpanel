import { OFFICIAL_SCENARIOS } from "./constants";
import type { InstanceRecord, RuntimeMeta } from "./types";
import type { ServerConfig } from "./config-schema";
import { PANEL_NAME } from "./panel-brand";

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
  };
  return map[status] ?? status;
}

export function statusBadgeColors(status: string) {
  if (status === "running") return { bg: "rgba(94, 159, 212, 0.18)", fg: "#9fd0ef", ring: "rgba(94, 159, 212, 0.45)" };
  if (status === "crashed") return { bg: "rgba(212, 106, 90, 0.18)", fg: "#e8a598", ring: "rgba(212, 106, 90, 0.45)" };
  if (status === "starting" || status === "stopping") {
    return { bg: "rgba(212, 165, 116, 0.18)", fg: "#e0c299", ring: "rgba(212, 165, 116, 0.45)" };
  }
  return { bg: "rgba(146, 154, 171, 0.15)", fg: "#b8beca", ring: "rgba(146, 154, 171, 0.35)" };
}

export function formatUptime(sec?: number) {
  if (sec == null) return "—";
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function connectAddress(config: ServerConfig | null) {
  if (!config) return "—";
  const host = config.publicAddress?.trim();
  const port = config.publicPort;
  if (host && port) return `${host}:${port}`;
  if (port) return `0.0.0.0:${port}`;
  return "—";
}

export function scenarioName(config: ServerConfig | null) {
  if (!config?.game?.scenarioId) return "—";
  const match = OFFICIAL_SCENARIOS.find((s) => s.id === config.game.scenarioId);
  if (match) return match.name;
  const tail = config.game.scenarioId.split("/").pop() ?? config.game.scenarioId;
  return tail.replace(/\.conf$/i, "").replace(/_/g, " ");
}

export function buildDiscordStatusEmbed(input: {
  instance: Pick<InstanceRecord, "name" | "status" | "slug" | "branch">;
  config: ServerConfig | null;
  runtime: RuntimeMeta;
  fps: number | null;
  playerCount?: string | null;
  listed?: boolean | null;
  imageUrl?: string;
}) {
  const { instance, config, runtime, fps, imageUrl, playerCount, listed } = input;
  const address = connectAddress(config);
  const now = new Date().toISOString();

  if (imageUrl) {
    return {
      color: statusColor(instance.status),
      image: { url: imageUrl },
      footer: { text: `${instance.slug} · ${instance.branch} · ${PANEL_NAME}` },
      timestamp: now,
    };
  }

  const scenario = scenarioName(config);
  const slots = config?.game?.maxPlayers ?? null;
  const playersField =
    playerCount && playerCount !== "—"
      ? playerCount
      : slots != null
        ? `0/${slots}`
        : "—";

  const crashed = instance.status === "crashed";

  return {
    author: { name: crashed ? `${PANEL_NAME} · Server crashed` : `${PANEL_NAME} · Live status` },
    title: crashed ? `⚠ ${instance.name} — Crashed` : instance.name,
    description: crashed
      ? "The server process stopped unexpectedly. Staff have been notified."
      : address !== "—"
        ? `**Connect** \`${address}\``
        : "Public address not configured",
    color: statusColor(instance.status),
    fields: [
      { name: "Status", value: statusLabel(instance.status), inline: true },
      { name: "Players", value: playersField, inline: true },
      { name: "FPS", value: fps != null ? String(Math.round(fps)) : "—", inline: true },
      {
        name: "Uptime",
        value: instance.status === "running" ? formatUptime(runtime.uptimeSec) : "—",
        inline: true,
      },
      { name: "Listed", value: listed == null ? "—" : listed ? "Yes" : "No", inline: true },
      { name: "Scenario", value: scenario, inline: true },
    ],
    footer: { text: instance.slug },
    timestamp: now,
  };
}

export function statusImageUrl(publicBase: string, instanceId: string) {
  const base = publicBase.replace(/\/$/, "");
  const bucket = Math.floor(Date.now() / 60_000);
  return `${base}/api/instances/${instanceId}/status.png?v=${bucket}`;
}

export function panelSupportsStatusImage(publicBase: string) {
  return publicBase.trim().toLowerCase().startsWith("https://");
}

export type StatusCardData = {
  name: string;
  status: string;
  slug: string;
  branch: string;
  address: string;
  scenario: string;
  slots: string;
  players: string;
  fps: number | null;
  uptime: string;
  memory: string;
};

export function toStatusCardData(input: {
  instance: Pick<InstanceRecord, "name" | "status" | "slug" | "branch">;
  config: ServerConfig | null;
  runtime: RuntimeMeta;
  fps: number | null;
  playerCount?: string | null;
}): StatusCardData {
  const { instance, config, runtime, fps, playerCount } = input;
  return {
    name: instance.name,
    status: instance.status,
    slug: instance.slug,
    branch: instance.branch,
    address: connectAddress(config),
    scenario: scenarioName(config),
    slots: config?.game?.maxPlayers != null ? String(config.game.maxPlayers) : "—",
    players: playerCount && playerCount !== "—" ? playerCount : "—",
    fps,
    uptime: instance.status === "running" ? formatUptime(runtime.uptimeSec) : "—",
    memory: runtime.memoryMb != null ? `${runtime.memoryMb} MB` : "—",
  };
}

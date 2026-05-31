import { formatPlayerCount, queryA2s } from "../lib/shared/a2s";
import { resolvePublicAddress } from "../lib/shared/config-schema";
import { deriveA2sPort } from "../lib/shared/network-ports";
import type { InstanceRecord } from "../lib/shared/types";
import { getHostInfo, readInstanceConfig } from "./instances";

export type InstanceQuerySnapshot = {
  listed: boolean;
  localListed: boolean;
  publicListed: boolean;
  providerFirewallLikely: boolean;
  players: number | null;
  maxPlayers: number | null;
  playerCount: string;
  map: string | null;
  serverName: string | null;
  latencyMs: number | null;
  error: string | null;
  queryHost: string;
  queryPort: number;
};

export function resolveA2sTarget(instance: InstanceRecord) {
  const config = readInstanceConfig(instance);
  const host = getHostInfo();
  const queryHost = resolvePublicAddress(config, host.publicIpHint) || host.publicIpHint || "127.0.0.1";
  const queryPort = deriveA2sPort(config.publicPort, config.a2s?.port);
  return { config, queryHost, queryPort };
}

export async function queryInstanceA2s(instance: InstanceRecord, timeoutMs = 2500): Promise<InstanceQuerySnapshot> {
  const { queryHost, queryPort } = resolveA2sTarget(instance);
  const hosts = ["127.0.0.1", queryHost].filter((host, index, all) => host && all.indexOf(host) === index);

  let result: Awaited<ReturnType<typeof queryA2s>> = { ok: false, error: "A2S query timed out" };
  let usedHost = queryHost;

  for (const host of hosts) {
    const attempt = await queryA2s(host, queryPort, timeoutMs);
    if (attempt.ok) {
      result = attempt;
      usedHost = host;
      break;
    }
    result = attempt;
  }

  if (!result.ok) {
    const stillStarting =
      instance.status === "starting" ||
      (instance.lastStartedAt &&
        Date.now() - new Date(instance.lastStartedAt).getTime() < 45_000);
    const error =
      stillStarting && result.error.includes("timed out")
        ? "Server still starting — A2S may not respond for ~30s after launch"
        : result.error;

    return {
      listed: false,
      players: null,
      maxPlayers: null,
      playerCount: "—",
      map: null,
      serverName: null,
      latencyMs: result.latencyMs ?? null,
      error,
      queryHost: usedHost,
      queryPort,
    };
  }

  return {
    listed: true,
    players: result.info.players,
    maxPlayers: result.info.maxPlayers,
    playerCount: formatPlayerCount(result.info),
    map: result.info.map || null,
    serverName: result.info.name || null,
    latencyMs: result.latencyMs,
    error: null,
    queryHost: usedHost,
    queryPort,
  };
}

import { queryA2s, queryA2sPlayers } from "../lib/shared/a2s";
import { resolvePublicAddress } from "../lib/shared/config-schema";
import { deriveA2sPort, resolveInstancePorts } from "../lib/shared/network-ports";
import type { RconPlayer } from "../lib/shared/rcon";
import { berconPlayersForInstance } from "./bercon";
import { getInstance } from "./db";
import { getHostInfo, readInstanceConfig } from "./instances";

export type InstancePlayersSnapshot = {
  players: RconPlayer[];
  rconCount: number;
  a2sCount: number | null;
  a2sMaxPlayers: number | null;
  a2sPlayers: { index: number; name: string }[];
  serverName: string | null;
  joinAddress: string;
  joinPort: number;
  raw: string;
  sourcesAgree: boolean;
};

export async function queryInstancePlayers(instanceId: string): Promise<InstancePlayersSnapshot> {
  const instance = getInstance(instanceId);
  if (!instance) throw new Error("Instance not found");

  const config = readInstanceConfig(instance);
  const host = getHostInfo();
  const ports = resolveInstancePorts(config);
  const joinHost = resolvePublicAddress(config, host.publicIpHint) || host.publicIpHint || "127.0.0.1";
  const joinAddress = `${joinHost}:${ports.game}`;
  const queryPort = deriveA2sPort(config.publicPort, config.a2s?.port);

  let rconPlayers: RconPlayer[] = [];
  let raw = "";
  try {
    const rcon = await berconPlayersForInstance(instanceId);
    rconPlayers = rcon.players;
    raw = rcon.raw;
  } catch {
    raw = "";
  }

  const a2sInfo = await queryA2s(joinHost, queryPort);
  const a2sPlayersResult = await queryA2sPlayers(joinHost, queryPort);
  const a2sPlayers =
    a2sPlayersResult.ok && a2sPlayersResult.players.length
      ? a2sPlayersResult.players
      : a2sPlayersResult.ok
        ? a2sPlayersResult.players
        : [];

  const merged =
    rconPlayers.length > 0
      ? rconPlayers
      : a2sPlayers.map((player, index) => ({
          id: player.index || index + 1,
          ip: "",
          ping: 0,
          guid: "",
          name: player.name || "Unknown",
        }));

  const a2sCount = a2sInfo.ok ? a2sInfo.info.players : null;
  const a2sMaxPlayers = a2sInfo.ok ? a2sInfo.info.maxPlayers : null;

  return {
    players: merged,
    rconCount: rconPlayers.length,
    a2sCount,
    a2sMaxPlayers,
    a2sPlayers: a2sPlayers.map((player) => ({ index: player.index, name: player.name })),
    serverName: a2sInfo.ok ? a2sInfo.info.name : config.game.name || null,
    joinAddress,
    joinPort: ports.game,
    raw,
    sourcesAgree: a2sCount == null || a2sCount === merged.length,
  };
}

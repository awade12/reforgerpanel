import type { ServerConfig } from "./config-schema";

export function deriveA2sPort(gamePort: number, configured?: number) {
  if (configured && configured > 0) return configured;
  return gamePort + 15776;
}

export function deriveRconPort(gamePort: number, configured?: number) {
  if (configured && configured > 0) return configured;
  return gamePort + 17998;
}

export type InstancePorts = {
  game: number;
  a2s: number;
  rcon: number;
  bindAddress: string;
  publicAddress: string;
};

export function resolveInstancePorts(config: ServerConfig): InstancePorts {
  const game = config.publicPort || config.bindPort || 0;
  return {
    game,
    a2s: deriveA2sPort(game, config.a2s?.port),
    rcon: deriveRconPort(game, config.rcon?.port),
    bindAddress: config.bindAddress?.trim() || "0.0.0.0",
    publicAddress: config.publicAddress?.trim() || "",
  };
}

export function buildUfwRules(ports: InstancePorts, slug: string) {
  const rules = [
    `ufw allow ${ports.game}/udp comment 'Reforger ${slug} game'`,
    `ufw allow ${ports.a2s}/udp comment 'Reforger ${slug} A2S'`,
  ];
  if (ports.rcon > 0) {
    rules.push(`ufw allow ${ports.rcon}/udp comment 'Reforger ${slug} RCon'`);
  }
  return rules;
}

export function buildUfwRulesDisplay(ports: InstancePorts, slug: string) {
  return [`# ${slug} — Arma Reforger`, ...buildUfwRules(ports, slug).map((r) => `sudo ${r}`)];
}

export type RegistrationCheck = {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
};

export function buildRegistrationDiagnostics(config: ServerConfig, listed?: boolean | null) {
  const ports = resolveInstancePorts(config);
  const checks: RegistrationCheck[] = [];

  checks.push({
    id: "public-address",
    label: "Public IP configured",
    ok: Boolean(ports.publicAddress),
    detail: ports.publicAddress || "Set publicAddress so players and the browser can reach this server",
  });

  checks.push({
    id: "game-port",
    label: "Game port set",
    ok: ports.game >= 1024 && ports.game <= 65535,
    detail: ports.game ? `UDP ${ports.game}` : "publicPort is missing",
  });

  checks.push({
    id: "visible",
    label: "Listed in server browser",
    ok: config.game.visible !== false,
    detail: config.game.visible === false ? "game.visible is false — direct connect only" : "Server is set to appear in browser",
  });

  checks.push({
    id: "bind-address",
    label: "Bind address",
    ok: true,
    detail: ports.bindAddress === "0.0.0.0" || ports.bindAddress
      ? `Listening on ${ports.bindAddress || "all interfaces"}`
      : "No bind address",
  });

  checks.push({
    id: "register-bind",
    label: "Backend registration address",
    ok: Boolean(ports.publicAddress),
    detail: ports.publicAddress
      ? `publicAddress=${ports.publicAddress} (replaces legacy gameHostRegisterBindAddress)`
      : "Set publicAddress for browser registration — on Docker/VPS use the reachable LAN or public IP",
  });

  checks.push({
    id: "a2s-port",
    label: "A2S query port",
    ok: ports.a2s > 0,
    detail: `UDP ${ports.a2s} — forward alongside game port`,
  });

  if (listed != null) {
    checks.push({
      id: "a2s-query",
      label: "A2S query responds",
      ok: listed,
      detail: listed ? "Query port answered — server looks listed" : "No A2S response — check firewall, bind address, or server not running",
    });
  }

  return { ports, checks, allOk: checks.every((c) => c.ok) };
}

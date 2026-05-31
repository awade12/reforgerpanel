import { lookup } from "dns/promises";
import { get } from "https";
import {
  buildConfigPreflightChecks,
  buildHostPreflightChecks,
  buildNetworkPreflightChecks,
  mergePreflightReport,
  type PreflightCheck,
  type PreflightReport,
} from "../lib/shared/preflight";
import type { ServerConfig } from "../lib/shared/config-schema";
import { resolveInstancePorts } from "../lib/shared/network-ports";
import type { Branch, InstanceRecord } from "../lib/shared/types";
import { firewallAvailable, ufwStatus } from "./firewall";
import { getHostInfo, readInstanceConfig } from "./instances";
import { getGameInstallStatus } from "./steamcmd";
import { validateBattleyeConfig } from "./battleye";
import { checkConfiguredMods } from "./mods";

function probeHttps(url: string, timeoutMs = 5000): Promise<boolean> {
  return new Promise((resolve) => {
    const req = get(url, { timeout: timeoutMs }, (res) => {
      res.resume();
      resolve((res.statusCode ?? 500) < 500);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function probeDns(host: string): Promise<boolean> {
  try {
    await lookup(host);
    return true;
  } catch {
    return false;
  }
}

function parseUfwPortOpen(port: number, proto: string, output: string): boolean {
  const re = new RegExp(`\\b${port}/${proto}\\b`, "i");
  return re.test(output);
}

function readUfwState() {
  if (!firewallAvailable()) {
    return { available: false, active: null as boolean | null, output: "" };
  }
  const status = ufwStatus();
  if (!status.ok) {
    return { available: true, active: null, output: status.output };
  }
  const active = /Status:\s*active/i.test(status.output);
  return { available: true, active, output: status.output };
}

let hostProbeCache: { at: number; steam: boolean; steamStatic: boolean; dns: boolean } | null = null;
const HOST_PROBE_MS = 60_000;

async function probeHostConnectivity() {
  const now = Date.now();
  if (hostProbeCache && now - hostProbeCache.at < HOST_PROBE_MS) {
    return hostProbeCache;
  }
  const [steam, steamStatic, dns] = await Promise.all([
    probeHttps("https://steamcommunity.com"),
    probeHttps("https://client-update.steamstatic.com"),
    probeDns("api.bistudio.com"),
  ]);
  hostProbeCache = { at: now, steam, steamStatic, dns };
  return hostProbeCache;
}

function battleyeChecks(instanceId: string): PreflightCheck[] {
  return validateBattleyeConfig(instanceId).map((detail, index) => ({
    id: `battleye-${index}`,
    label: "BattlEye config",
    severity: "warn" as const,
    detail,
    category: "battleye" as const,
  }));
}

function modChecks(instance: InstanceRecord): PreflightCheck[] {
  return checkConfiguredMods(instance)
    .filter((mod) => !mod.ok && mod.modId)
    .map((mod, index) => ({
      id: `mod-${index}-${mod.modId}`,
      label: mod.name || mod.modId,
      severity: "warn" as const,
      detail: mod.detail || "Mod not found on disk",
      category: "mods" as const,
    }));
}

export async function runInstancePreflight(
  instance: InstanceRecord,
  config?: ServerConfig,
): Promise<PreflightReport> {
  const cfg = config ?? readInstanceConfig(instance);
  const host = getHostInfo();
  const ports = resolveInstancePorts(cfg);
  const ufw = readUfwState();
  const connectivity = await probeHostConnectivity();
  const install = getGameInstallStatus();
  const branchInstall = instance.branch === "stable" ? install.stable : install.experimental;

  const checks: PreflightCheck[] = [
    ...buildConfigPreflightChecks(cfg, host.publicIpHint),
    ...buildNetworkPreflightChecks({
      ufwAvailable: ufw.available,
      ufwActive: ufw.active,
      gamePortOpen: ufw.active ? parseUfwPortOpen(ports.game, "udp", ufw.output) : null,
      a2sPortOpen: ufw.active ? parseUfwPortOpen(ports.a2s, "udp", ufw.output) : null,
      gamePort: ports.game,
      a2sPort: ports.a2s,
    }),
    ...buildHostPreflightChecks({
      gameInstalled: branchInstall.installed,
      branch: instance.branch,
      outboundSteam: connectivity.steam,
      outboundSteamStatic: connectivity.steamStatic,
      dnsBohemia: connectivity.dns,
      maxFps: instance.maxFps,
    }),
    ...battleyeChecks(instance.id),
    ...modChecks(instance),
  ];

  return mergePreflightReport(checks);
}

export async function runHostPreflightForGameUpdate(): Promise<PreflightReport> {
  const connectivity = await probeHostConnectivity();
  const install = getGameInstallStatus();
  const checks: PreflightCheck[] = [
    ...buildHostPreflightChecks({
      gameInstalled: install.stable.installed || install.experimental.installed,
      branch: "stable",
      outboundSteam: connectivity.steam,
      outboundSteamStatic: connectivity.steamStatic,
      dnsBohemia: connectivity.dns,
      maxFps: 60,
    }),
  ];
  if (!install.stable.installed && !install.experimental.installed) {
    checks.push({
      id: "game-any",
      label: "Game server installed",
      severity: "warn",
      detail: "No game branch installed yet — update will install stable",
      category: "host",
    });
  }
  return mergePreflightReport(checks);
}

export { probeHostConnectivity };

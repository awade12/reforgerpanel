import os from "os";
import { execSync } from "child_process";
import type { HostStatus, HostStatusCheck, HostStatusInstance } from "../lib/shared/types";
import { queryInstanceA2s } from "./a2s";
import { collectStartWarnings } from "./diagnostics";
import { firewallAvailable, ufwStatus } from "./firewall";
import { getHostInfo, getRuntimeMeta, readInstanceConfig } from "./instances";
import { parseFpsFromLogs } from "./logs";
import { checkConfiguredMods } from "./mods";
import { listInstances } from "./db";
import { getGameInstallStatus } from "./steamcmd";
import { agentConfig } from "./config";

type StatusCache = {
  fullAt: number;
  quickAt: number;
  full: HostStatus;
  quick: HostStatus;
};

let statusCache: StatusCache | null = null;
let ufwCache: { at: number; active: boolean | null } | null = null;

const FULL_CACHE_MS = 60_000;
const QUICK_CACHE_MS = 15_000;
const UFW_CACHE_MS = 60_000;

function diskTotalGb() {
  try {
    const raw = execSync(`df -BG ${agentConfig.reforgerRoot} | tail -1 | awk '{print $2}'`, { encoding: "utf8" }).trim();
    return Number(raw.replace("G", "")) || 0;
  } catch {
    return 0;
  }
}

function cachedUfwActive() {
  const now = Date.now();
  if (ufwCache && now - ufwCache.at < UFW_CACHE_MS) return ufwCache.active;
  if (!firewallAvailable()) {
    ufwCache = { at: now, active: null };
    return null;
  }
  const status = ufwStatus();
  const active = status.ok && /Status:\s*active/i.test(status.output);
  ufwCache = { at: now, active: active ? true : false };
  return ufwCache.active;
}

function formatUptime(sec: number) {
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function pushCheck(checks: HostStatusCheck[], check: HostStatusCheck) {
  checks.push(check);
}

function overallLevel(checks: HostStatusCheck[]) {
  if (checks.some((item) => item.level === "error")) return "critical";
  if (checks.some((item) => item.level === "warn")) return "attention";
  return "healthy";
}

async function buildHostStatus(quick: boolean): Promise<HostStatus> {
  const hostInfo = getHostInfo();
  const game = getGameInstallStatus();
  const instances = listInstances();
  const checks: HostStatusCheck[] = [];
  const rows: HostStatusInstance[] = [];
  let totalPlayers = 0;

  const memTotalMb = hostInfo.memoryTotalMb ?? Math.round(os.totalmem() / 1024 / 1024);
  const memFreeMb = hostInfo.memoryFreeMb ?? Math.round(os.freemem() / 1024 / 1024);
  const memUsedMb = hostInfo.memoryUsedMb ?? memTotalMb - memFreeMb;
  const loadAvg = hostInfo.loadAvg ?? [os.loadavg()[0], os.loadavg()[1], os.loadavg()[2]];
  const diskTotal = diskTotalGb();

  if (hostInfo.diskFreeGb < 5) {
    pushCheck(checks, {
      id: "disk-critical",
      level: "error",
      label: "Disk space critical",
      detail: `${hostInfo.diskFreeGb} GB free on ${agentConfig.reforgerRoot}`,
    });
  } else if (hostInfo.diskFreeGb < 20) {
    pushCheck(checks, {
      id: "disk-low",
      level: "warn",
      label: "Disk space low",
      detail: `${hostInfo.diskFreeGb} GB free — mods and logs can fill this quickly`,
    });
  } else {
    pushCheck(checks, {
      id: "disk",
      level: "ok",
      label: "Disk space",
      detail: `${hostInfo.diskFreeGb} GB free of ${diskTotal || "?"} GB`,
    });
  }

  if (!game.stable.installed && !game.experimental.installed) {
    pushCheck(checks, {
      id: "game-missing",
      level: instances.length ? "error" : "warn",
      label: "Game server not installed",
      detail: "Install stable or experimental under Game Install",
    });
  } else {
    const branches = [game.stable.installed && "stable", game.experimental.installed && "experimental"]
      .filter(Boolean)
      .join(", ");
    pushCheck(checks, {
      id: "game",
      level: "ok",
      label: "Game server",
      detail: `Installed: ${branches}`,
    });
  }

  const fwActive = cachedUfwActive();
  if (fwActive === false) {
    pushCheck(checks, {
      id: "firewall",
      level: "warn",
      label: "Firewall inactive",
      detail: "UFW is installed but not active — players may not reach game ports",
    });
  } else if (fwActive === true) {
    pushCheck(checks, {
      id: "firewall",
      level: "ok",
      label: "Firewall",
      detail: "UFW active",
    });
  }

  const runningInstances = instances.filter((item) => item.status === "running");
  const a2sResults = quick
    ? new Map<string, Awaited<ReturnType<typeof queryInstanceA2s>>>()
    : new Map(
        await Promise.all(
          runningInstances.map(async (instance) => [instance.id, await queryInstanceA2s(instance, 900)] as const),
        ),
      );

  for (const instance of instances) {
    const runtime = getRuntimeMeta(instance);
    let port = 0;
    let modIssues = 0;
    let playerCount: string | null = null;
    let listed: boolean | null = null;
    let fps: number | null = null;

    try {
      const config = readInstanceConfig(instance);
      port = config.publicPort;
      if (!quick) {
        modIssues = checkConfiguredMods(instance).filter((mod) => !mod.ok).length;
        const startWarnings = await collectStartWarnings(instance);
        startWarnings.forEach((warning, index) => {
          pushCheck(checks, {
            id: `${instance.slug}-warn-${index}`,
            level: "warn",
            label: instance.name,
            detail: warning,
          });
        });
      }
    } catch {
      pushCheck(checks, {
        id: `${instance.slug}-config`,
        level: "error",
        label: instance.name,
        detail: "Config file missing or invalid",
      });
    }

    if (instance.status === "running") {
      if (!quick) fps = parseFpsFromLogs(instance.profilePath);

      if (quick) {
        if (instance.lastKnownPlayerCount != null) {
          totalPlayers += instance.lastKnownPlayerCount;
          playerCount = String(instance.lastKnownPlayerCount);
        }
      } else {
        const a2s = a2sResults.get(instance.id);
        if (a2s) {
          listed = a2s.listed;
          playerCount = a2s.playerCount;
          if (a2s.players != null) totalPlayers += a2s.players;
          if (!a2s.listed) {
            pushCheck(checks, {
              id: `${instance.slug}-a2s`,
              level: "warn",
              label: `${instance.name} not listed`,
              detail: a2s.error || "A2S query failed — check publicAddress and firewall",
            });
          }
        }
      }

      if (!quick && fps != null && fps < 30) {
        pushCheck(checks, {
          id: `${instance.slug}-fps`,
          level: "warn",
          label: `${instance.name} low FPS`,
          detail: `Server FPS is ${fps.toFixed(1)}`,
        });
      }

      if (!runtime.systemdActive) {
        pushCheck(checks, {
          id: `${instance.slug}-systemd`,
          level: "error",
          label: `${instance.name} systemd off`,
          detail: "Panel shows running but systemd unit is inactive",
        });
      }
    }

    if (instance.status === "crashed") {
      pushCheck(checks, {
        id: `${instance.slug}-crashed`,
        level: "error",
        label: `${instance.name} crashed`,
        detail: `Restart count: ${instance.restartCount}`,
      });
    }

    if (!quick && modIssues > 0) {
      pushCheck(checks, {
        id: `${instance.slug}-mods`,
        level: "warn",
        label: `${instance.name} mods`,
        detail: `${modIssues} configured mod(s) not found on disk`,
      });
    }

    rows.push({
      id: instance.id,
      name: instance.name,
      slug: instance.slug,
      status: instance.status,
      branch: instance.branch,
      port,
      systemdActive: Boolean(runtime.systemdActive),
      memoryMb: runtime.memoryMb,
      uptimeSec: runtime.uptimeSec,
      fps,
      playerCount,
      listed,
      modIssues,
    });
  }

  const running = runningInstances.length;
  const stopped = instances.filter((item) => item.status === "stopped").length;
  const crashed = instances.filter((item) => item.status === "crashed").length;

  if (instances.length === 0) {
    pushCheck(checks, {
      id: "instances",
      level: "warn",
      label: "No instances",
      detail: "Create a dedicated server instance to get started",
    });
  } else if (running === 0) {
    pushCheck(checks, {
      id: "instances-stopped",
      level: "warn",
      label: "All instances stopped",
      detail: `${instances.length} instance(s) configured, none running`,
    });
  } else {
    pushCheck(checks, {
      id: "instances",
      level: "ok",
      label: "Instances",
      detail: `${running} running · ${totalPlayers} player(s) online`,
    });
  }

  const deduped = checks.filter(
    (check, index, list) => list.findIndex((item) => item.id === check.id) === index,
  );

  return {
    at: new Date().toISOString(),
    overall: overallLevel(deduped),
    host: {
      hostname: hostInfo.hostname ?? os.hostname(),
      primaryIp: hostInfo.publicIpHint || hostInfo.ips[0] || "",
      loadAvg: loadAvg as [number, number, number],
      memoryTotalMb: memTotalMb,
      memoryUsedMb: memUsedMb,
      memoryFreeMb: memFreeMb,
      diskFreeGb: hostInfo.diskFreeGb,
      diskTotalGb: diskTotal,
      uptimeSec: Math.floor(os.uptime()),
      uptimeLabel: hostInfo.uptimeLabel ?? formatUptime(Math.floor(os.uptime())),
    },
    game,
    firewall: {
      available: firewallAvailable(),
      active: fwActive,
    },
    instances: {
      total: instances.length,
      running,
      stopped,
      crashed,
      totalPlayers,
      rows,
    },
    checks: deduped,
  };
}

export async function getHostStatus(options?: { quick?: boolean }): Promise<HostStatus> {
  const quick = options?.quick ?? false;
  const now = Date.now();

  if (statusCache) {
    if (quick && now - statusCache.quickAt < QUICK_CACHE_MS) return statusCache.quick;
    if (!quick && now - statusCache.fullAt < FULL_CACHE_MS) return statusCache.full;
  }

  const status = await buildHostStatus(quick);

  if (!statusCache) {
    statusCache = {
      fullAt: quick ? 0 : now,
      quickAt: quick ? now : 0,
      full: status,
      quick: status,
    };
  } else if (quick) {
    statusCache.quick = status;
    statusCache.quickAt = now;
  } else {
    statusCache.full = status;
    statusCache.fullAt = now;
  }

  return status;
}

export function invalidateHostStatusCache() {
  statusCache = null;
  ufwCache = null;
}

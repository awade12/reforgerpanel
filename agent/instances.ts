import fs from "fs";
import os from "os";
import { execSync } from "child_process";
import { v4 as uuidv4 } from "uuid";
import {
  createDefaultConfig,
  parseServerConfig,
  prepareConfigForLaunch,
  sanitizeNetworkAddresses,
  assertPortAvailable,
  validatePlatformCombo,
} from "../lib/shared/config-schema";
import { HttpError } from "../lib/shared/http-error";
import type { Branch, HostInfo, InstanceRecord, InstanceWithConfig, RuntimeMeta } from "../lib/shared/types";
import { buildLaunchShell } from "../lib/shared/startup-params";
import { agentConfig } from "./config";
import {
  addAudit,
  clearBotDashboardRecovery,
  deleteInstance,
  getInstance,
  getInstanceBySlug,
  getUsedPorts,
  insertInstance,
  instanceDir,
  listInstances,
  nextFreePort,
  updateInstance,
} from "./db";
import { getGameInstallStatus } from "./steamcmd";
import {
  ensureInstancePermissions,
  getInstanceSystemdStatus,
  isActive,
  removeInstanceStartScript,
  restartInstance,
  startInstance,
  stopInstance,
  writeInstanceStartScript,
} from "./systemd";

const REFORGER_CTL = "/usr/local/bin/reforger-ctl";
import { mergeInstanceAlerts } from "../lib/shared/alerts";
import { mergeInstanceAlertSecrets, mergeServerConfigSecrets } from "../lib/shared/secrets";
import type { ServerConfig } from "../lib/shared/config-schema";
import { handleAlertsSettingsChange, notifyDiscord, syncInstanceStatusEmbed, deleteInstanceStatusEmbed } from "./alerts";
import { collectStartWarnings } from "./diagnostics";
import { applyUfwRules } from "./firewall";
import { getSettings } from "./db";
import {
  reconcileInstanceStatus,
  readRuntimeCache,
  RUNTIME_CACHE_MS,
  writeRuntimeCache,
} from "./instance-state";

const instanceOps = new Set<string>();
const TRANSITIONAL: InstanceRecord["status"][] = ["starting", "stopping"];

function assertInstanceOp(id: string, instance: InstanceRecord, action: string) {
  if (instanceOps.has(id)) {
    throw new HttpError(409, `Instance is busy; wait for the current ${action} to finish`);
  }
  if (TRANSITIONAL.includes(instance.status)) {
    throw new HttpError(409, `Instance is ${instance.status}; wait before ${action}`);
  }
}

function beginInstanceOp(id: string) {
  if (instanceOps.has(id)) throw new HttpError(409, "Instance operation already in progress");
  instanceOps.add(id);
}

function endInstanceOp(id: string) {
  instanceOps.delete(id);
}

function uniqueSlug(name: string, id: string) {
  let slug = slugify(name) || id.slice(0, 8);
  const base = slug;
  let n = 2;
  while (getInstanceBySlug(slug)) {
    slug = `${base}-${n}`.slice(0, 40);
    n += 1;
  }
  return slug;
}

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

export function getHostInfo(): HostInfo {
  const nets = os.networkInterfaces();
  const ips: string[] = [];
  for (const entries of Object.values(nets)) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) ips.push(entry.address);
    }
  }
  let diskFreeGb = 0;
  try {
    const df = execSync(`df -BG ${agentConfig.reforgerRoot} | tail -1 | awk '{print $4}'`, { encoding: "utf8" }).trim();
    diskFreeGb = Number(df.replace("G", "")) || 0;
  } catch {
    diskFreeGb = 0;
  }
  const memTotalMb = Math.round(os.totalmem() / 1024 / 1024);
  const memFreeMb = Math.round(os.freemem() / 1024 / 1024);
  const uptimeSec = Math.floor(os.uptime());
  const hours = Math.floor(uptimeSec / 3600);
  const minutes = Math.floor((uptimeSec % 3600) / 60);
  const uptimeLabel = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  const load = os.loadavg();
  const cpuCount = os.cpus().length || 1;
  let diskTotalGb = 0;
  try {
    const raw = execSync(`df -BG ${agentConfig.reforgerRoot} | tail -1 | awk '{print $2}'`, { encoding: "utf8" }).trim();
    diskTotalGb = Number(raw.replace("G", "")) || 0;
  } catch {
    diskTotalGb = 0;
  }

  const instanceList = listInstances();
  let playersOnline = 0;
  let instancesRunning = 0;
  let instanceRamMb = 0;
  for (const instance of instanceList) {
    playersOnline += instance.lastKnownPlayerCount ?? 0;
    const runtime = getRuntimeMeta(instance);
    if (runtime.systemdActive) {
      instancesRunning += 1;
      instanceRamMb += runtime.memoryMb ?? 0;
    }
  }

  return {
    ips,
    publicIpHint: ips[0] ?? "",
    reforgerRoot: agentConfig.reforgerRoot,
    diskFreeGb,
    hostname: os.hostname(),
    memoryTotalMb: memTotalMb,
    memoryUsedMb: memTotalMb - memFreeMb,
    memoryFreeMb: memFreeMb,
    loadAvg: [load[0], load[1], load[2]],
    uptimeLabel,
    cpuCount,
    diskTotalGb,
    playersOnline,
    instancesRunning,
    instancesTotal: instanceList.length,
    instanceRamMb,
  };
}

export function readInstanceConfig(instance: InstanceRecord) {
  if (!fs.existsSync(instance.configPath)) {
    throw new HttpError(500, `Config file missing: ${instance.configPath}`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(instance.configPath, "utf8"));
  } catch {
    throw new HttpError(400, "Config file is not valid JSON");
  }
  return parseServerConfig(raw);
}

export function writeInstanceConfig(instance: InstanceRecord, config: unknown, ipHint?: string) {
  const parsed = parseServerConfig(config);
  const excludePort = readInstanceConfigSafe(instance)?.publicPort;
  assertPortAvailable(parsed.publicPort, getUsedPorts(), excludePort);
  const host = ipHint ?? getHostInfo().publicIpHint;
  const prepared = prepareConfigForLaunch(parsed, host);
  fs.writeFileSync(instance.configPath, JSON.stringify(prepared, null, 2));
  return parsed;
}

function readInstanceConfigSafe(instance: InstanceRecord) {
  try {
    return readInstanceConfig(instance);
  } catch {
    return null;
  }
}

function computeRuntimeMeta(instance: InstanceRecord): RuntimeMeta {
  const meta: RuntimeMeta = { systemdActive: isActive(instance) };
  if (!meta.systemdActive) return meta;

  try {
    const pidRaw = execSync(`sudo -n ${REFORGER_CTL} show ${`reforger@${instance.slug}.service`} -p MainPID --value`, { encoding: "utf8" }).trim();
    const pid = Number(pidRaw);
    if (pid > 0) {
      meta.pid = pid;
      const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8").split(" ");
      const startTicks = Number(stat[21]);
      const clkTick = 100;
      meta.uptimeSec = Math.max(0, Math.floor(os.uptime() - startTicks / clkTick));
      const status = fs.readFileSync(`/proc/${pid}/status`, "utf8");
      const mem = status.match(/VmRSS:\s+(\d+) kB/);
      meta.memoryMb = mem ? Math.round(Number(mem[1]) / 1024) : undefined;
    }
  } catch {
    /* ignore */
  }

  try {
    const du = execSync(`du -sm ${instance.profilePath} 2>/dev/null | cut -f1`, { encoding: "utf8" }).trim();
    meta.diskUsageMb = Number(du) || 0;
  } catch {
    meta.diskUsageMb = 0;
  }

  if (instance.lastStartedAt) {
    meta.uptimeSec = Math.floor((Date.now() - new Date(instance.lastStartedAt).getTime()) / 1000);
  }

  return meta;
}

export function getRuntimeMeta(instance: InstanceRecord): RuntimeMeta {
  const cached = readRuntimeCache(instance.id);
  if (cached && Date.now() - cached.at < RUNTIME_CACHE_MS) return cached.meta;
  const meta = computeRuntimeMeta(instance);
  writeRuntimeCache(instance.id, meta);
  return meta;
}

export function listInstancesDetailed(): InstanceWithConfig[] {
  return listInstances().map((raw) => {
    const instance = reconcileInstanceStatus(raw);
    let config: InstanceWithConfig["config"];
    try {
      config = readInstanceConfig(instance);
    } catch {
      config = createDefaultConfig({
        name: instance.name,
        scenarioId: "{ECC61978EDCC2B5A}Missions/23_Campaign.conf",
        publicPort: 2001,
      });
    }
    return {
      ...instance,
      config,
      runtime: getRuntimeMeta(instance),
    };
  });
}

export function getInstanceDetailed(id: string): InstanceWithConfig | null {
  const raw = getInstance(id);
  if (!raw) return null;
  const instance = reconcileInstanceStatus(raw);
  return {
    ...instance,
    config: readInstanceConfig(instance),
    runtime: getRuntimeMeta(instance),
  };
}

export interface CreateInstanceInput {
  name: string;
  branch: Branch;
  scenarioId: string;
  publicPort?: number;
  publicAddress?: string;
  maxPlayers?: number;
  crossPlatform?: boolean;
  mods?: ReturnType<typeof createDefaultConfig>["game"]["mods"];
}

export function createInstance(input: CreateInstanceInput) {
  if (input.branch !== "stable" && input.branch !== "experimental") {
    throw new HttpError(400, "branch must be stable or experimental");
  }
  if (!input.scenarioId?.trim()) {
    throw new HttpError(400, "scenarioId is required");
  }
  if (input.publicPort != null) {
    assertPortAvailable(input.publicPort, getUsedPorts());
  }

  const id = uuidv4();
  const slug = uniqueSlug(input.name, id);
  const port = input.publicPort ?? nextFreePort();
  const dir = instanceDir(id);
  const configPath = `${dir}/config.json`;
  const profilePath = `${dir}/profile`;
  const battleyePath = `${profilePath}/battleye`;
  const tmpPath = `${dir}/tmp`;

  fs.mkdirSync(profilePath, { recursive: true });
  fs.mkdirSync(battleyePath, { recursive: true });
  fs.mkdirSync(tmpPath, { recursive: true });

  const host = getHostInfo();
  const config = sanitizeNetworkAddresses(
    createDefaultConfig({
    name: input.name,
    scenarioId: input.scenarioId,
    publicPort: port,
    publicAddress: input.publicAddress ?? "",
    mods: input.mods,
    }),
    host.publicIpHint,
  );
  if (input.maxPlayers) config.game.maxPlayers = input.maxPlayers;
  if (input.crossPlatform) {
    config.game.crossPlatform = true;
    config.game.supportedPlatforms = ["PLATFORM_PC", "PLATFORM_XBL", "PLATFORM_PSN"];
  }

  fs.writeFileSync(configPath, JSON.stringify(prepareConfigForLaunch(config, host.publicIpHint), null, 2));

  const now = new Date().toISOString();
  const record: InstanceRecord = {
    id,
    name: input.name,
    slug,
    branch: input.branch,
    createdAt: now,
    updatedAt: now,
    autoRestart: true,
    maxFps: 60,
    logStatsMs: 5000,
    logLevel: null,
    addonTempDir: tmpPath,
    status: "stopped",
    lastStartedAt: null,
    restartCount: 0,
    configPath,
    profilePath,
    battleyePath,
    alerts: mergeInstanceAlerts(),
    discordStatusMessageId: null,
    discordBotStatusMessageId: null,
    lastLowFpsAlertAt: null,
    lastLowFpsRecoveryAt: null,
    lastMemoryAlertAt: null,
    lastStatusEmbedAt: null,
    lastKnownPlayerCount: null,
    lastJoinLeaveScanAt: null,
    discordBotCrashPingAt: null,
    discordBotEmptySince: null,
    discordBotSeedPingAt: null,
  };

  insertInstance(record);
  ensureInstancePermissions(record);
  syncSystemdUnit(record);
  addAudit("instance.create", `${record.name} (${record.slug})`);
  return getInstanceDetailed(id);
}

export function syncSystemdUnit(instance: InstanceRecord) {
  const launchShell = buildLaunchShell({
    instance,
    configPath: instance.configPath,
    profilePath: instance.profilePath,
    addonTempDir: instance.addonTempDir,
    maxFps: instance.maxFps,
    logStatsMs: instance.logStatsMs,
    logLevel: instance.logLevel,
  });
  writeInstanceStartScript(instance, launchShell);
}

export async function startInstanceById(id: string) {
  const instance = getInstance(id);
  if (!instance) throw new HttpError(404, "Instance not found");
  assertInstanceOp(id, instance, "start");
  beginInstanceOp(id);
  try {
    const install = getGameInstallStatus();
    const branchInstall = instance.branch === "stable" ? install.stable : install.experimental;
    if (!branchInstall.installed || !branchInstall.binary) {
      throw new HttpError(
        409,
        `${instance.branch} server not installed. Install it from the Game page first.`,
      );
    }

    const host = getHostInfo();
    const raw = readInstanceConfig(instance);
    const config = sanitizeNetworkAddresses(raw, host.publicIpHint);
    fs.writeFileSync(instance.configPath, JSON.stringify(prepareConfigForLaunch(config, host.publicIpHint), null, 2));
    ensureInstancePermissions(instance);
    const warnings = [...validatePlatformCombo(config), ...collectStartWarnings(instance)];
    syncSystemdUnit(instance);
    updateInstance(id, { status: "starting" });
    const result = startInstance(instance);
    if (!result.ok) {
      updateInstance(id, { status: "crashed" });
      throw new HttpError(502, result.stderr || "Failed to start systemd unit");
    }
    updateInstance(id, { status: "running", lastStartedAt: new Date().toISOString() });
    addAudit("instance.start", instance.slug);
    if (warnings.length) {
      await notifyDiscord("start-warning", instance, warnings.join("\n"), { warnings: warnings.length });
    }
    if (getSettings().enableFirewallAutomation) {
      try {
        applyUfwRules(config, instance.slug);
      } catch {
        /* optional */
      }
    }
    await notifyDiscord("started", instance, `Instance started on port ${config.publicPort}`);
    void syncInstanceStatusEmbed(id);
    return { instance: getInstanceDetailed(id), warnings };
  } finally {
    endInstanceOp(id);
  }
}

export async function stopInstanceById(id: string) {
  const instance = getInstance(id);
  if (!instance) throw new HttpError(404, "Instance not found");
  assertInstanceOp(id, instance, "stop");
  beginInstanceOp(id);
  try {
    updateInstance(id, { status: "stopping" });
    const result = stopInstance(instance);
    if (!result.ok && result.stderr && !result.stderr.includes("not loaded")) {
      throw new HttpError(502, result.stderr || "Failed to stop systemd unit");
    }
    updateInstance(id, { status: "stopped" });
    clearBotDashboardRecovery(id);
    addAudit("instance.stop", instance.slug);
    await notifyDiscord("stopped", instance, "Instance stopped");
    void syncInstanceStatusEmbed(id);
    return getInstanceDetailed(id);
  } finally {
    endInstanceOp(id);
  }
}

export async function restartInstanceById(id: string) {
  const instance = getInstance(id);
  if (!instance) throw new HttpError(404, "Instance not found");
  assertInstanceOp(id, instance, "restart");
  beginInstanceOp(id);
  try {
    const host = getHostInfo();
    const raw = readInstanceConfig(instance);
    const config = sanitizeNetworkAddresses(raw, host.publicIpHint);
    fs.writeFileSync(instance.configPath, JSON.stringify(prepareConfigForLaunch(config, host.publicIpHint), null, 2));
    ensureInstancePermissions(instance);
    const warnings = validatePlatformCombo(config);
    syncSystemdUnit(instance);
    const result = restartInstance(instance);
    if (!result.ok) {
      throw new HttpError(502, result.stderr || "Failed to restart systemd unit");
    }
    updateInstance(id, { status: "running", lastStartedAt: new Date().toISOString() });
    addAudit("instance.restart", instance.slug);
    await notifyDiscord("restarted", instance, "Instance restarted");
    void syncInstanceStatusEmbed(id);
    return { instance: getInstanceDetailed(id), warnings };
  } finally {
    endInstanceOp(id);
  }
}

export function removeInstanceById(id: string) {
  const instance = getInstance(id);
  if (!instance) throw new HttpError(404, "Instance not found");
  if (instanceOps.has(id)) {
    throw new HttpError(409, "Cannot delete instance while an operation is in progress");
  }
  beginInstanceOp(id);
  try {
    if (isActive(instance) || instance.status === "running" || instance.status === "starting") {
      stopInstance(instance);
    }
    removeInstanceStartScript(instance);
    void deleteInstanceStatusEmbed(id).catch(() => undefined);
    deleteInstance(id);
    fs.rmSync(instanceDir(id), { recursive: true, force: true });
    addAudit("instance.delete", instance.slug);
  } finally {
    endInstanceOp(id);
  }
}

export function updateInstanceSettings(id: string, patch: Partial<InstanceRecord> & { config?: unknown; alerts?: Partial<InstanceRecord["alerts"]> }) {
  const instance = getInstance(id);
  if (!instance) throw new HttpError(404, "Instance not found");
  if (instanceOps.has(id)) {
    throw new HttpError(409, "Cannot update instance while an operation is in progress");
  }
  const before = { ...instance, alerts: { ...instance.alerts } };
  if (patch.config) {
    const current = readInstanceConfig(instance);
    writeInstanceConfig(instance, mergeServerConfigSecrets(current, patch.config as Partial<ServerConfig>));
  }
  const { config: _cfg, alerts: alertsPatch, ...rest } = patch;
  const nextAlerts = alertsPatch ? mergeInstanceAlertSecrets(instance.alerts, alertsPatch) : undefined;
  updateInstance(id, { ...rest, ...(nextAlerts ? { alerts: nextAlerts } : {}) });
  const next = getInstance(id)!;
  ensureInstancePermissions(next);
  syncSystemdUnit(next);
  addAudit("instance.update", next.slug);
  const detailed = getInstanceDetailed(id);
  void handleAlertsSettingsChange(before, next).catch((err) => console.error("[alerts]", err));
  return detailed;
}

export function getInstanceStatus(id: string) {
  const raw = getInstance(id);
  if (!raw) return null;
  const instance = reconcileInstanceStatus(raw);
  return {
    instance,
    systemd: getInstanceSystemdStatus(instance),
    active: isActive(instance),
    runtime: getRuntimeMeta(instance),
  };
}

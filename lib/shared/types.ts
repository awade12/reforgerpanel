import type { ModEntry, ServerConfig } from "./config-schema";

export type Branch = "stable" | "experimental";

export type InstanceRotationConfig = {
  enabled: boolean;
  missionSlugs: string[];
  nextIndex: number;
  cron: string;
  onlyIfEmpty: boolean;
  replaceMods: boolean;
  downloadMods: boolean;
  enableMaintenanceBanner: boolean;
  autoBackup: boolean;
  maintenanceMessage: string;
  lastRotatedAt: string | null;
  lastMissionSlug: string | null;
  lastRunKey: string | null;
};

export type InstanceRotationStatus = {
  rotation: InstanceRotationConfig;
  currentMissionTitle: string | null;
  currentMissionSlug: string | null;
  nextMissionTitle: string | null;
  nextMissionSlug: string | null;
  nextScheduledAt: string | null;
};

export interface InstanceRecord {
  id: string;
  name: string;
  slug: string;
  branch: Branch;
  createdAt: string;
  updatedAt: string;
  autoRestart: boolean;
  maxFps: number;
  logStatsMs: number | null;
  logLevel: string | null;
  addonTempDir: string;
  status: InstanceStatus;
  lastStartedAt: string | null;
  restartCount: number;
  configPath: string;
  profilePath: string;
  battleyePath: string;
  alerts: InstanceAlertSettings;
  discordStatusMessageId: string | null;
  discordBotStatusMessageId: string | null;
  lastLowFpsAlertAt: string | null;
  lastLowFpsRecoveryAt: string | null;
  lastMemoryAlertAt: string | null;
  lastStatusEmbedAt: string | null;
  lastKnownPlayerCount: number | null;
  lastJoinLeaveScanAt: string | null;
  discordBotCrashPingAt: string | null;
  discordBotEmptySince: string | null;
  discordBotSeedPingAt: string | null;
  rotation: InstanceRotationConfig;
}

export type InstanceStatus = "stopped" | "starting" | "running" | "stopping" | "crashed" | "updating";

export interface InstanceWithConfig extends InstanceRecord {
  config: ServerConfig;
  runtime?: RuntimeMeta;
}

export interface RuntimeMeta {
  pid?: number;
  systemdActive?: boolean;
  cpuPercent?: number;
  memoryMb?: number;
  uptimeSec?: number;
  diskUsageMb?: number;
}

export interface MissionMeta {
  slug: string;
  title: string;
  scenarioId: string;
  source: "Custom" | "Workshop" | "Arma Reforger";
  requiredModIds: string[];
  requiredMods: ModEntry[];
  createdAt: string;
}

export interface GameInstallStatus {
  stable: { installed: boolean; path: string; binary: string | null };
  experimental: { installed: boolean; path: string; binary: string | null };
}

export interface HostInfo {
  ips: string[];
  publicIpHint: string;
  reforgerRoot: string;
  diskFreeGb: number;
  usedPorts?: number[];
  suggestedPort?: number;
  hostname?: string;
  memoryTotalMb?: number;
  memoryUsedMb?: number;
  memoryFreeMb?: number;
  loadAvg?: [number, number, number];
  uptimeLabel?: string;
  cpuCount?: number;
  diskTotalGb?: number;
  playersOnline?: number;
  instancesRunning?: number;
  instancesTotal?: number;
  instanceRamMb?: number;
  networkIngressMbps?: number | null;
  networkEgressMbps?: number | null;
  networkInterface?: string | null;
}

export type MetricsTimeRange = "1h" | "6h" | "24h" | "7d" | "30d";
export type MetricsResolution = "raw" | "1m" | "5m" | "1h";

export interface HostMetricSample {
  at: string;
  cpuPercent: number | null;
  memoryPercent: number | null;
  memoryUsedMb: number | null;
  memoryTotalMb: number | null;
  load1: number | null;
  load5: number | null;
  load15: number | null;
  diskFreeGb: number | null;
  diskUsedPercent: number | null;
  playersOnline: number | null;
  instancesRunning: number | null;
  instancesTotal: number | null;
  instanceRamMb: number | null;
  ingressMbps: number | null;
  egressMbps: number | null;
  networkIface: string | null;
}

export interface InstanceMetricSample {
  at: string;
  instanceId: string;
  status: string;
  fps: number | null;
  memoryMb: number | null;
  cpuPercent: number | null;
  playerCount: number | null;
  maxPlayers: number | null;
  a2sListed: boolean | null;
  a2sLatencyMs: number | null;
  diskProfileMb: number | null;
  systemdActive: boolean | null;
  uptimeSec: number | null;
  hostLoad1: number | null;
  hostMemoryPercent: number | null;
}

export interface InstanceMetricEvent {
  id: number;
  at: string;
  instanceId: string;
  kind: string;
  payload: Record<string, unknown>;
}

export interface MetricsSummary {
  enabled: boolean;
  retentionDays: number;
  hostSamples: number;
  instanceSamples: number;
  oldestSample: string | null;
}

export interface HostStatusMetrics extends MetricsSummary {
  latestSampleAt: string | null;
  latestCpuPercent: number | null;
  latestMemoryPercent: number | null;
  collectIntervalSec: number;
}

export interface InstanceMetricsStats {
  avgFps: number | null;
  minFps: number | null;
  maxFps: number | null;
  avgMemoryMb: number | null;
  peakPlayers: number | null;
  avgPlayers: number | null;
  sampleCount: number;
}

export interface InstanceMetricsSparkPoint {
  at: string;
  fps: number | null;
  memoryMb: number | null;
  players: number | null;
}

export interface InstanceMetricsOverviewItem {
  instanceId: string;
  latest: InstanceMetricSample | null;
  stats: InstanceMetricsStats;
  sparkline: InstanceMetricsSparkPoint[];
}

export interface HostMetricsStats {
  avgCpu: number | null;
  peakCpu: number | null;
  avgMemory: number | null;
  peakMemory: number | null;
  peakPlayers: number | null;
  peakGameRam: number | null;
  avgLoad1: number | null;
}

export type HostHealthLevel = "healthy" | "attention" | "critical";

export type HostStatusCheck = {
  id: string;
  level: "ok" | "warn" | "error";
  label: string;
  detail: string;
};

export type HostStatusInstance = {
  id: string;
  name: string;
  slug: string;
  status: string;
  branch: string;
  port: number;
  systemdActive: boolean;
  memoryMb?: number;
  uptimeSec?: number;
  fps?: number | null;
  playerCount?: string | null;
  listed?: boolean | null;
  modIssues: number;
};

export interface HostStatus {
  at: string;
  overall: HostHealthLevel;
  agent?: {
    startedAt: string;
    uptimeSec: number;
    metricsCollecting: boolean;
  };
  metrics?: HostStatusMetrics;
  host: {
    hostname: string;
    primaryIp: string;
    loadAvg: [number, number, number];
    memoryTotalMb: number;
    memoryUsedMb: number;
    memoryFreeMb: number;
    diskFreeGb: number;
    diskTotalGb: number;
    uptimeSec: number;
    uptimeLabel: string;
  };
  game: GameInstallStatus;
  firewall: {
    available: boolean;
    active: boolean | null;
  };
  instances: {
    total: number;
    running: number;
    stopped: number;
    crashed: number;
    totalPlayers: number;
    rows: HostStatusInstance[];
  };
  checks: HostStatusCheck[];
}

export interface AuditEntry {
  id: number;
  at: string;
  action: string;
  detail: string;
}

import type { PanelPermissions, PanelRole } from "./permissions";

export type { PanelPermissions, PanelRole } from "./permissions";

export type PanelUser = {
  id: string;
  email: string;
  name: string;
  role: PanelRole;
  permissions: PanelPermissions;
  disabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
};

export interface SettingsRecord {
  discordWebhookUrl: string;
  discordStatusWebhookUrl: string;
  discordAlertRoleId: string;
  discordBotEnabled: boolean;
  discordBotToken: string;
  discordBotClientId: string;
  discordBotGuildId: string;
  discordBotAdminRoleId: string;
  discordBotStatusChannelId: string;
  discordBotMaintenanceEnabled: boolean;
  discordBotMaintenanceMessage: string;
  discordBotSeedPingEnabled: boolean;
  discordBotSeedRoleId: string;
  discordBotSeedEmptyMinutes: number;
  scheduledUpdateCron: string;
  enableScheduledUpdates: boolean;
  enableModAwareUpdates: boolean;
  enableScheduledPanelUpdates: boolean;
  scheduledPanelUpdateCron: string;
  enableDailyDigest: boolean;
  dailyDigestCron: string;
  memoryAlertThresholdMb: number;
  enableMemoryAlerts: boolean;
  enableFirewallAutomation: boolean;
  resendApiKey: string;
  resendFromEmail: string;
  resendEnabled: boolean;
  enableScheduledRestarts: boolean;
  scheduledRestartCron: string;
  scheduledRestartScope: "all" | "running";
  enableMaintenanceBeforeRestart: boolean;
  maintenanceRestartMessage: string;
  autoBackupBeforeRestart: boolean;
}

export interface InstanceBackupMeta {
  id: string;
  instanceId: string;
  createdAt: string;
  sizeBytes: number;
  sizeLabel: string;
  label: string;
  includesLogs: boolean;
}

export interface InstanceTemplateMeta {
  slug: string;
  title: string;
  description: string;
  branch: Branch;
  createdAt: string;
  sourceInstanceName?: string;
}

export type MaintenanceRestartTrigger = "scheduled" | "manual";

export interface MaintenanceRestartJobState {
  running: boolean;
  trigger: MaintenanceRestartTrigger | null;
  ok: boolean | null;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  restartedInstances: string[];
  backedUpInstances: string[];
  nextScheduledAt: string | null;
}

export interface BotRuntimeRecord {
  lastSeenAt: string | null;
  lastDeployAt: string | null;
  username: string | null;
  tag: string | null;
  discordBotMaintenanceMessageId: string | null;
}

export type BotDashboardInstanceRow = {
  id: string;
  slug: string;
  name: string;
  messageId: string | null;
  embed: Record<string, unknown>;
  crashPing: boolean;
};

export type BotDashboardSeedPing = {
  instanceId: string;
  instanceName: string;
  playerCount: string;
};

export type BotDashboardSync = {
  maintenance: {
    enabled: boolean;
    message: string;
    messageId: string | null;
  };
  alertRoleId: string;
  seedRoleId: string;
  instances: BotDashboardInstanceRow[];
  seedPings: BotDashboardSeedPing[];
};

export interface DiscordBotStatusResponse {
  connected: boolean;
  lastSeenAt: string | null;
  lastDeployAt: string | null;
  username: string | null;
  tag: string | null;
  inviteUrl: string | null;
}

export interface InstanceAlertSettings {
  discordWebhookUrl: string;
  alertOnStart: boolean;
  alertOnStop: boolean;
  alertOnRestart: boolean;
  alertOnCrash: boolean;
  alertOnAutoRestart: boolean;
  alertOnCrashLoop: boolean;
  alertOnLowFps: boolean;
  alertOnFpsRecovery: boolean;
  alertOnStartWarning: boolean;
  alertOnPlayerJoin: boolean;
  alertOnPlayerLeave: boolean;
  alertOnHighMemory: boolean;
  lowFpsThreshold: number;
  statusEmbedEnabled: boolean;
}

export type InstanceAlertEvent =
  | "started"
  | "stopped"
  | "restarted"
  | "crashed"
  | "auto-restart"
  | "crash-loop"
  | "low-fps"
  | "fps-recovery"
  | "start-warning"
  | "player-join"
  | "player-leave"
  | "high-memory"
  | "game-update"
  | "test";

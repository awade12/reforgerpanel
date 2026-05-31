import type { ModEntry, ServerConfig } from "./config-schema";

export type Branch = "stable" | "experimental";

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

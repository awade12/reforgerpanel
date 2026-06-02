import type { InstanceAlertSettings, SettingsRecord } from "./types";

export function defaultInstanceAlerts(): InstanceAlertSettings {
  return {
    discordWebhookUrl: "",
    alertOnStart: true,
    alertOnStop: true,
    alertOnRestart: true,
    alertOnCrash: true,
    alertOnAutoRestart: true,
    alertOnCrashLoop: true,
    alertOnLowFps: false,
    alertOnFpsRecovery: true,
    alertOnStartWarning: true,
    alertOnPlayerJoin: false,
    alertOnPlayerLeave: false,
    alertOnHighMemory: false,
    lowFpsThreshold: 30,
    statusEmbedEnabled: false,
  };
}

export function mergeInstanceAlerts(partial?: Partial<InstanceAlertSettings>): InstanceAlertSettings {
  return { ...defaultInstanceAlerts(), ...partial };
}

export function defaultSettings() {
  return {
    discordWebhookUrl: "",
    discordStatusWebhookUrl: "",
    discordAlertRoleId: "",
    discordBotEnabled: false,
    discordBotToken: "",
    discordBotClientId: "",
    discordBotGuildId: "",
    discordBotAdminRoleId: "",
    discordBotStatusChannelId: "",
    discordBotMaintenanceEnabled: false,
    discordBotMaintenanceMessage: "",
    discordBotSeedPingEnabled: false,
    discordBotSeedRoleId: "",
    discordBotSeedEmptyMinutes: 15,
    scheduledUpdateCron: "0 4 * * *",
    enableScheduledUpdates: false,
    enableModAwareUpdates: true,
    enableScheduledPanelUpdates: false,
    scheduledPanelUpdateCron: "0 3 * * 0",
    enableDailyDigest: false,
    dailyDigestCron: "0 8 * * *",
    memoryAlertThresholdMb: 4096,
    enableMemoryAlerts: false,
    enableFirewallAutomation: true,
    resendApiKey: "",
    resendFromEmail: "",
    resendEnabled: false,
    enableScheduledRestarts: false,
    scheduledRestartCron: "0 5 * * 0",
    scheduledRestartScope: "running",
    enableMaintenanceBeforeRestart: true,
    maintenanceRestartMessage: "",
    autoBackupBeforeRestart: true,
  };
}

export function mergeSettings<T extends object>(partial?: Partial<T>, base?: T): T {
  return { ...(base ?? defaultSettings()), ...partial } as T;
}

export function normalizePanelSettings(partial?: Partial<SettingsRecord>): SettingsRecord {
  const merged = mergeSettings<SettingsRecord>(partial);
  return {
    ...merged,
    discordWebhookUrl: merged.discordWebhookUrl ?? "",
    discordStatusWebhookUrl: merged.discordStatusWebhookUrl ?? "",
    discordAlertRoleId: merged.discordAlertRoleId ?? "",
    discordBotEnabled: Boolean(merged.discordBotEnabled),
    discordBotToken: merged.discordBotToken ?? "",
    discordBotClientId: merged.discordBotClientId ?? "",
    discordBotGuildId: merged.discordBotGuildId ?? "",
    discordBotAdminRoleId: merged.discordBotAdminRoleId ?? "",
    discordBotStatusChannelId: merged.discordBotStatusChannelId ?? "",
    discordBotMaintenanceEnabled: Boolean(merged.discordBotMaintenanceEnabled),
    discordBotMaintenanceMessage: merged.discordBotMaintenanceMessage ?? "",
    discordBotSeedPingEnabled: Boolean(merged.discordBotSeedPingEnabled),
    discordBotSeedRoleId: merged.discordBotSeedRoleId ?? "",
    discordBotSeedEmptyMinutes: Math.max(1, Number(merged.discordBotSeedEmptyMinutes) || 15),
    scheduledUpdateCron: merged.scheduledUpdateCron ?? "0 4 * * *",
    enableScheduledUpdates: Boolean(merged.enableScheduledUpdates),
    enableModAwareUpdates: Boolean(merged.enableModAwareUpdates),
    enableScheduledPanelUpdates: Boolean(merged.enableScheduledPanelUpdates),
    scheduledPanelUpdateCron: merged.scheduledPanelUpdateCron ?? "0 3 * * 0",
    enableDailyDigest: Boolean(merged.enableDailyDigest),
    dailyDigestCron: merged.dailyDigestCron ?? "0 8 * * *",
    memoryAlertThresholdMb: Number(merged.memoryAlertThresholdMb) || 4096,
    enableMemoryAlerts: Boolean(merged.enableMemoryAlerts),
    enableFirewallAutomation: Boolean(merged.enableFirewallAutomation),
    resendApiKey: merged.resendApiKey ?? "",
    resendFromEmail: merged.resendFromEmail ?? "",
    resendEnabled: Boolean(merged.resendEnabled),
    enableScheduledRestarts: Boolean(merged.enableScheduledRestarts),
    scheduledRestartCron: merged.scheduledRestartCron ?? "0 5 * * 0",
    scheduledRestartScope: merged.scheduledRestartScope === "all" ? "all" : "running",
    enableMaintenanceBeforeRestart: Boolean(merged.enableMaintenanceBeforeRestart),
    maintenanceRestartMessage: merged.maintenanceRestartMessage ?? "",
    autoBackupBeforeRestart: Boolean(merged.autoBackupBeforeRestart),
  };
}

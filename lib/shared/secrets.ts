import type { ServerConfig } from "./config-schema";
import { mergeInstanceAlerts, normalizePanelSettings } from "./alerts";
import { decryptSecretField, encryptSecretField } from "./secrets-crypto";
import type { InstanceAlertSettings, InstanceWithConfig, SettingsRecord } from "./types";

export const SECRET_MASK = "••••••••";

export const SETTINGS_SECRET_FIELDS = [
  "discordBotToken",
  "discordWebhookUrl",
  "discordStatusWebhookUrl",
  "resendApiKey",
] as const satisfies readonly (keyof SettingsRecord)[];

export const INSTANCE_ALERT_SECRET_FIELDS = ["discordWebhookUrl"] as const satisfies readonly (keyof InstanceAlertSettings)[];

export type SettingsSecretFlags = {
  hasDiscordBotToken: boolean;
  hasDiscordWebhookUrl: boolean;
  hasDiscordStatusWebhookUrl: boolean;
  hasResendApiKey: boolean;
};

export type InstanceAlertSecretFlags = {
  hasDiscordWebhookUrl: boolean;
};

export type ServerConfigSecretFlags = {
  hasGamePassword: boolean;
  hasGamePasswordAdmin: boolean;
  hasRconPassword: boolean;
};

export type PanelSettingsResponse = SettingsRecord & SettingsSecretFlags;
export type PanelInstanceAlerts = InstanceAlertSettings & InstanceAlertSecretFlags;

function isMasked(value: string | undefined) {
  return value === SECRET_MASK;
}

function hasSecret(value: string | undefined) {
  return Boolean(value?.trim()) && !isMasked(value);
}

export function settingsSecretFlags(settings: SettingsRecord): SettingsSecretFlags {
  return {
    hasDiscordBotToken: hasSecret(settings.discordBotToken),
    hasDiscordWebhookUrl: hasSecret(settings.discordWebhookUrl),
    hasDiscordStatusWebhookUrl: hasSecret(settings.discordStatusWebhookUrl),
    hasResendApiKey: hasSecret(settings.resendApiKey),
  };
}

export function instanceAlertSecretFlags(alerts: InstanceAlertSettings): InstanceAlertSecretFlags {
  return {
    hasDiscordWebhookUrl: hasSecret(alerts.discordWebhookUrl),
  };
}

export function serverConfigSecretFlags(config: ServerConfig): ServerConfigSecretFlags {
  return {
    hasGamePassword: hasSecret(config.game.password),
    hasGamePasswordAdmin: hasSecret(config.game.passwordAdmin),
    hasRconPassword: hasSecret(config.rcon?.password ?? ""),
  };
}

export function encryptSettingsRecord(settings: SettingsRecord): SettingsRecord {
  const copy = { ...settings };
  for (const field of SETTINGS_SECRET_FIELDS) {
    if (copy[field]) copy[field] = encryptSecretField(copy[field]);
  }
  return copy;
}

export function decryptSettingsRecord(settings: SettingsRecord): SettingsRecord {
  const copy = { ...settings };
  for (const field of SETTINGS_SECRET_FIELDS) {
    if (copy[field]) copy[field] = decryptSecretField(copy[field]);
  }
  return copy;
}

export function encryptInstanceAlerts(alerts: InstanceAlertSettings): InstanceAlertSettings {
  const copy = { ...alerts };
  for (const field of INSTANCE_ALERT_SECRET_FIELDS) {
    if (copy[field]) copy[field] = encryptSecretField(copy[field]);
  }
  return copy;
}

export function decryptInstanceAlerts(alerts: InstanceAlertSettings): InstanceAlertSettings {
  const copy = { ...alerts };
  for (const field of INSTANCE_ALERT_SECRET_FIELDS) {
    if (copy[field]) copy[field] = decryptSecretField(copy[field]);
  }
  return copy;
}

export function redactSettingsForPanel(settings: SettingsRecord): PanelSettingsResponse {
  const flags = settingsSecretFlags(settings);
  const copy = { ...settings };
  for (const field of SETTINGS_SECRET_FIELDS) {
    if (copy[field]) copy[field] = SECRET_MASK;
  }
  return { ...copy, ...flags };
}

export function mergeSettingsSecrets(current: SettingsRecord, patch: Partial<SettingsRecord>): SettingsRecord {
  const merged = { ...current, ...patch };
  for (const field of SETTINGS_SECRET_FIELDS) {
    const value = patch[field];
    if (value === undefined || value === SECRET_MASK || value === "") {
      merged[field] = current[field];
    }
  }
  return merged;
}

export function redactInstanceAlertsForPanel(alerts: InstanceAlertSettings): PanelInstanceAlerts {
  const flags = instanceAlertSecretFlags(alerts);
  const copy = { ...alerts };
  for (const field of INSTANCE_ALERT_SECRET_FIELDS) {
    if (copy[field]) copy[field] = SECRET_MASK;
  }
  return { ...copy, ...flags };
}

export function mergeInstanceAlertSecrets(
  current: InstanceAlertSettings,
  patch: Partial<InstanceAlertSettings>,
): InstanceAlertSettings {
  const merged = mergeInstanceAlerts({ ...current, ...patch });
  for (const field of INSTANCE_ALERT_SECRET_FIELDS) {
    const value = patch[field];
    if (value === undefined || value === SECRET_MASK || value === "") {
      merged[field] = current[field];
    }
  }
  return merged;
}

export function redactServerConfigForPanel(config: ServerConfig): ServerConfig & ServerConfigSecretFlags {
  const flags = serverConfigSecretFlags(config);
  return {
    ...config,
    game: {
      ...config.game,
      password: config.game.password ? SECRET_MASK : "",
      passwordAdmin: config.game.passwordAdmin ? SECRET_MASK : "",
    },
    rcon: {
      ...config.rcon,
      password: config.rcon?.password ? SECRET_MASK : "",
    },
    ...flags,
  };
}

export function mergeServerConfigSecrets(current: ServerConfig, patch: Partial<ServerConfig>): ServerConfig {
  const next: ServerConfig = {
    ...current,
    ...patch,
    game: { ...current.game, ...(patch.game ?? {}) },
    a2s: { ...current.a2s, ...(patch.a2s ?? {}) },
    rcon: { ...current.rcon, ...(patch.rcon ?? {}) },
  };

  if (isMasked(patch.game?.password) || patch.game?.password === "") {
    next.game.password = current.game.password;
  }
  if (isMasked(patch.game?.passwordAdmin) || patch.game?.passwordAdmin === "") {
    next.game.passwordAdmin = current.game.passwordAdmin;
  }
  if (isMasked(patch.rcon?.password) || patch.rcon?.password === "") {
    next.rcon.password = current.rcon?.password ?? "";
  }

  return next;
}

export function redactInstanceForPanel(instance: InstanceWithConfig) {
  return {
    ...instance,
    alerts: redactInstanceAlertsForPanel(instance.alerts),
    config: redactServerConfigForPanel(instance.config),
  };
}

export type BattleyeConfigResponse = {
  content: string;
  path: string;
  rconPort: number | null;
  rconPassword: string | null;
  hasRconPassword: boolean;
};

export function redactBattleyeForPanel(input: {
  content: string;
  path: string;
  rconPort: number | null;
  rconPassword: string | null;
}): BattleyeConfigResponse {
  return {
    ...input,
    rconPassword: input.rconPassword ? SECRET_MASK : null,
    hasRconPassword: Boolean(input.rconPassword),
  };
}

export function normalizePanelSettingsResponse(partial?: Partial<PanelSettingsResponse>): PanelSettingsResponse {
  const settings = normalizePanelSettings(partial);
  const inferred = settingsSecretFlags(settings);
  return {
    ...settings,
    hasDiscordBotToken: partial?.hasDiscordBotToken ?? inferred.hasDiscordBotToken,
    hasDiscordWebhookUrl: partial?.hasDiscordWebhookUrl ?? inferred.hasDiscordWebhookUrl,
    hasDiscordStatusWebhookUrl: partial?.hasDiscordStatusWebhookUrl ?? inferred.hasDiscordStatusWebhookUrl,
    hasResendApiKey: partial?.hasResendApiKey ?? inferred.hasResendApiKey,
  };
}

export function normalizeInstanceAlertsResponse(partial?: Partial<PanelInstanceAlerts>): PanelInstanceAlerts {
  const alerts = mergeInstanceAlerts(partial);
  const inferred = instanceAlertSecretFlags(alerts);
  return {
    ...alerts,
    hasDiscordWebhookUrl: partial?.hasDiscordWebhookUrl ?? inferred.hasDiscordWebhookUrl,
  };
}

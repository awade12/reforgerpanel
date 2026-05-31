import { z } from "zod";
import { HttpError } from "./http-error";
import { normalizeAddonModId } from "./workshop-catalog";

export const modSchema = z.object({
  modId: z.string().min(1).transform(normalizeAddonModId),
  name: z.string().optional(),
  version: z.string().optional(),
  required: z.boolean().optional(),
  workshopId: z.string().optional(),
});

export const serverConfigSchema = z.object({
  bindAddress: z.string().optional().default(""),
  bindPort: z.number().int().min(0).max(65535).optional().default(0),
  publicAddress: z.string().optional().default(""),
  publicPort: z.number().int().min(0).max(65535).optional().default(0),
  a2s: z
    .object({
      address: z.string().optional().default(""),
      port: z.number().int().min(0).max(65535).optional().default(0),
    })
    .optional()
    .default({ address: "", port: 0 }),
  rcon: z
    .object({
      address: z.string().optional().default(""),
      port: z.number().int().min(0).max(65535).optional().default(0),
      password: z.string().optional().default(""),
      maxClients: z.number().int().min(1).max(16).optional(),
      permission: z.enum(["admin", "monitor"]).optional().default("monitor"),
      blacklist: z.array(z.string()).optional().default([]),
      whitelist: z.array(z.string()).optional().default([]),
    })
    .optional()
    .default({
      address: "",
      port: 0,
      password: "",
      permission: "monitor",
      blacklist: [],
      whitelist: [],
    }),
  game: z.object({
    name: z.string().max(100).default("Reforger Server"),
    password: z.string().optional().default(""),
    passwordAdmin: z.string().optional().default(""),
    admins: z.array(z.string()).max(20).optional().default([]),
    scenarioId: z.string().min(1),
    maxPlayers: z.number().int().min(1).max(128).default(32),
    visible: z.boolean().default(true),
    crossPlatform: z.boolean().optional().default(false),
    supportedPlatforms: z
      .array(z.enum(["PLATFORM_PC", "PLATFORM_XBL", "PLATFORM_PSN"]))
      .optional()
      .default(["PLATFORM_PC"]),
    modsRequiredByDefault: z.boolean().optional().default(true),
    gameProperties: z
      .object({
        serverMaxViewDistance: z.number().min(500).max(10000).optional().default(1600),
        serverMinGrassDistance: z.number().min(50).optional().default(50),
        networkViewDistance: z.number().min(500).max(5000).optional().default(1500),
        disableThirdPerson: z.boolean().optional().default(false),
        fastValidation: z.boolean().optional().default(true),
        battlEye: z.boolean().optional().default(true),
        VONDisableUI: z.boolean().optional().default(false),
        VONDisableDirectSpeechUI: z.boolean().optional().default(false),
        VONCanTransmitCrossFaction: z.boolean().optional().default(false),
        missionHeader: z.record(z.string(), z.unknown()).optional(),
      })
      .optional()
      .default({
        serverMaxViewDistance: 1600,
        serverMinGrassDistance: 50,
        networkViewDistance: 1500,
        disableThirdPerson: false,
        fastValidation: true,
        battlEye: true,
        VONDisableUI: false,
        VONDisableDirectSpeechUI: false,
        VONCanTransmitCrossFaction: false,
      }),
    mods: z.array(modSchema).optional().default([]),
  }),
  operating: z
    .object({
      lobbyPlayerSynchronise: z.boolean().optional().default(true),
      disableCrashReporter: z.boolean().optional().default(false),
      disableNavmeshStreaming: z.union([z.boolean(), z.array(z.string())]).optional(),
      disableServerShutdown: z.boolean().optional().default(false),
      disableAI: z.boolean().optional().default(false),
      playerSaveTime: z.number().optional().default(120),
      aiLimit: z.number().optional().default(-1),
      slotReservationTimeout: z.number().min(5).max(300).optional().default(60),
      joinQueue: z
        .object({
          maxSize: z.number().min(0).max(50).optional().default(0),
        })
        .optional(),
    })
    .optional()
    .default({
      lobbyPlayerSynchronise: true,
      disableCrashReporter: false,
      disableServerShutdown: false,
      disableAI: false,
      playerSaveTime: 120,
      aiLimit: -1,
      slotReservationTimeout: 60,
      joinQueue: { maxSize: 0 },
    }),
});

export type ServerConfig = z.infer<typeof serverConfigSchema>;
export type ModEntry = z.infer<typeof modSchema>;

export function createDefaultConfig(input: {
  name: string;
  scenarioId: string;
  publicPort: number;
  publicAddress?: string;
  mods?: ModEntry[];
}): ServerConfig {
  return serverConfigSchema.parse({
    bindAddress: "",
    bindPort: input.publicPort,
    publicAddress: input.publicAddress ?? "",
    publicPort: input.publicPort,
    a2s: { address: "", port: DEFAULT_A2S_OFFSET(input.publicPort) },
    rcon: {
      address: "",
      port: DEFAULT_RCON_OFFSET(input.publicPort),
      password: "",
      permission: "monitor",
      blacklist: [],
      whitelist: [],
    },
    game: {
      name: input.name,
      password: "",
      passwordAdmin: "",
      admins: [],
      scenarioId: input.scenarioId,
      maxPlayers: 32,
      visible: true,
      crossPlatform: false,
      supportedPlatforms: ["PLATFORM_PC"],
      modsRequiredByDefault: true,
      gameProperties: {
        serverMaxViewDistance: 1600,
        serverMinGrassDistance: 50,
        networkViewDistance: 1500,
        disableThirdPerson: false,
        fastValidation: true,
        battlEye: true,
        VONDisableUI: false,
        VONDisableDirectSpeechUI: false,
        VONCanTransmitCrossFaction: false,
      },
      mods: input.mods ?? [],
    },
    operating: {
      lobbyPlayerSynchronise: true,
      disableCrashReporter: false,
      disableServerShutdown: false,
      disableAI: false,
      playerSaveTime: 120,
      aiLimit: -1,
      slotReservationTimeout: 60,
      joinQueue: { maxSize: 0 },
    },
  });
}

const IPV4_PATTERN = /^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$/;

function DEFAULT_A2S_OFFSET(gamePort: number) {
  return gamePort + 15776;
}

function DEFAULT_RCON_OFFSET(gamePort: number) {
  return gamePort + 17998;
}

export { DEFAULT_A2S_OFFSET, DEFAULT_RCON_OFFSET };

/** Resolve the public IPv4 advertised to players and Bohemia backend registration. */
export function resolvePublicAddress(config: ServerConfig, ipHint?: string): string {
  const candidates = [config.publicAddress, ipHint ?? ""];
  for (const raw of candidates) {
    const value = raw?.trim() ?? "";
    if (value && IPV4_PATTERN.test(value)) return value;
  }
  return "";
}

/** a2s/rcon address is a bind address (interface), not the public registration IP. */
export function normalizeServiceBindAddress(value: string | undefined, publicAddress?: string): string {
  const trimmed = value?.trim() ?? "";
  const pub = publicAddress?.trim() ?? "";
  if (!trimmed || trimmed === "0.0.0.0" || (pub && trimmed === pub)) return "";
  return trimmed;
}

/** Fill publicAddress and normalize service bind addresses before launch. */
export function sanitizeNetworkAddresses(config: ServerConfig, ipHint?: string): ServerConfig {
  const address = resolvePublicAddress(config, ipHint);
  const next: ServerConfig = {
    ...config,
    a2s: { ...config.a2s },
    rcon: { ...config.rcon },
  };

  if (address && !next.publicAddress?.trim()) {
    next.publicAddress = address;
  }

  next.a2s.address = normalizeServiceBindAddress(next.a2s.address, next.publicAddress);
  next.rcon.address = normalizeServiceBindAddress(next.rcon.address, next.publicAddress);

  if (next.publicPort > 0) {
    if (!next.a2s.port) next.a2s.port = DEFAULT_A2S_OFFSET(next.publicPort);
    if (!next.rcon.port) next.rcon.port = DEFAULT_RCON_OFFSET(next.publicPort);
    if (!next.bindPort) next.bindPort = next.publicPort;
  }

  return serverConfigSchema.parse(next);
}

const LEGACY_CONFIG_KEYS = [
  "gameHostRegisterBindAddress",
  "gameHostBindAddress",
  "gameHostRegisterAddress",
  "gameHostRegisterPort",
  "gameHostBindPort",
] as const;

export function normalizeLegacyConfig(input: unknown): unknown {
  if (!input || typeof input !== "object") return input;
  const raw = { ...(input as Record<string, unknown>) };
  if (!String(raw.publicAddress ?? "").trim() && typeof raw.gameHostRegisterBindAddress === "string") {
    raw.publicAddress = raw.gameHostRegisterBindAddress;
  }
  if (!String(raw.bindAddress ?? "").trim() && typeof raw.gameHostBindAddress === "string") {
    raw.bindAddress = raw.gameHostBindAddress;
  }
  for (const key of LEGACY_CONFIG_KEYS) {
    delete raw[key];
  }
  return raw;
}

function omitEmptyIpv4Field(obj: Record<string, unknown>, key: string) {
  const value = obj[key];
  if (typeof value === "string" && !value.trim()) {
    delete obj[key];
  }
}

const DEFAULT_BIND_ADDRESS = "0.0.0.0";

/** Game schema requires a2s/rcon address to be a valid IPv4 — use all-interfaces bind. */
export function resolveBindAddressForDisk(value: unknown, publicAddress?: string): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  const pub = publicAddress?.trim() ?? "";
  if (!trimmed || (pub && trimmed === pub)) return DEFAULT_BIND_ADDRESS;
  return trimmed;
}

/** Strip fields the game JSON schema rejects before writing config.json. */
export function configForDisk(config: ServerConfig): Record<string, unknown> {
  const obj = normalizeLegacyConfig(JSON.parse(JSON.stringify(config))) as Record<string, unknown>;
  omitEmptyIpv4Field(obj, "bindAddress");

  const publicAddress = typeof obj.publicAddress === "string" ? obj.publicAddress : "";
  const a2s = obj.a2s as Record<string, unknown> | undefined;
  if (a2s) {
    a2s.address = resolveBindAddressForDisk(a2s.address, publicAddress);
  }

  const rcon = obj.rcon as { password?: string; address?: string } | undefined;
  if (!rcon?.password || rcon.password.length < 3) {
    delete obj.rcon;
  } else {
    rcon.address = resolveBindAddressForDisk(rcon.address, publicAddress);
  }

  return obj;
}

/** Clamp values to game schema limits before launch. */
export function prepareConfigForLaunch(config: ServerConfig, ipHint?: string): Record<string, unknown> {
  const sanitized = sanitizeNetworkAddresses(config, ipHint);
  const props = sanitized.game.gameProperties;
  if (props && props.serverMinGrassDistance < 50) {
    props.serverMinGrassDistance = 50;
  }
  return configForDisk(sanitized);
}

export function formatZodError(err: z.ZodError): string {
  return err.issues.map((issue) => `${issue.path.join(".") || "config"}: ${issue.message}`).join("; ");
}

export function parseServerConfig(input: unknown): ServerConfig {
  const result = serverConfigSchema.safeParse(normalizeLegacyConfig(input));
  if (!result.success) {
    throw new HttpError(400, `Invalid config — ${formatZodError(result.error)}`);
  }
  return result.data;
}

export function assertPortAvailable(port: number, usedPorts: number[], excludePort?: number) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new HttpError(400, "Port must be an integer between 1024 and 65535");
  }
  const taken = usedPorts.filter((p) => p !== excludePort);
  if (taken.includes(port)) {
    throw new HttpError(409, `Port ${port} is already used by another instance`);
  }
}

export function validatePlatformCombo(config: ServerConfig): string[] {
  const warnings: string[] = [];
  const mods = config.game.mods ?? [];
  const platforms = config.game.supportedPlatforms ?? ["PLATFORM_PC"];
  const isModded = mods.length > 0;

  if (!isModded && platforms.includes("PLATFORM_XBL") && !platforms.includes("PLATFORM_PSN")) {
    warnings.push("Vanilla server cannot be PC + Xbox only. Use all consoles or modded server.");
  }
  if (!isModded && platforms.includes("PLATFORM_PSN") && platforms.length > 1 && !platforms.includes("PLATFORM_XBL")) {
    warnings.push("Vanilla server cannot mix PC + PlayStation without Xbox.");
  }
  if (isModded && platforms.includes("PLATFORM_PSN")) {
    warnings.push("Modded servers do not support PlayStation (PLATFORM_PSN).");
  }
  if (!config.game.gameProperties?.fastValidation) {
    warnings.push("fastValidation should be true for public internet servers.");
  }
  return warnings;
}

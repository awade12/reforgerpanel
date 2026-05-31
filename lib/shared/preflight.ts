import type { ServerConfig } from "./config-schema";
import { prepareConfigForLaunch, resolveBindAddressForDisk } from "./config-schema";
import { resolveInstancePorts } from "./network-ports";

export type PreflightSeverity = "ok" | "warn" | "error";

export type PreflightCheck = {
  id: string;
  label: string;
  severity: PreflightSeverity;
  detail: string;
  category: "config" | "network" | "host" | "mods" | "battleye";
};

export type PreflightReport = {
  checks: PreflightCheck[];
  canStart: boolean;
  canUpdateGame: boolean;
  errorCount: number;
  warnCount: number;
};

const IPV4_PATTERN = /^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$/;

function check(
  id: string,
  label: string,
  severity: PreflightSeverity,
  detail: string,
  category: PreflightCheck["category"],
): PreflightCheck {
  return { id, label, severity, detail, category };
}

export function buildConfigPreflightChecks(config: ServerConfig, ipHint?: string): PreflightCheck[] {
  const checks: PreflightCheck[] = [];
  const ports = resolveInstancePorts(config);
  const publicAddress = ports.publicAddress || ipHint?.trim() || "";

  let disk: Record<string, unknown>;
  try {
    disk = prepareConfigForLaunch(config, ipHint);
  } catch (err) {
    checks.push(
      check(
        "config-prepare",
        "Config prepares for launch",
        "error",
        err instanceof Error ? err.message : "Config failed validation",
        "config",
      ),
    );
    return checks;
  }

  const a2s = disk.a2s as { address?: string; port?: number } | undefined;
  const a2sAddress = a2s?.address?.trim() ?? "";

  if (!a2sAddress || !IPV4_PATTERN.test(a2sAddress)) {
    checks.push(
      check(
        "a2s-address-schema",
        "A2S bind address (game schema)",
        "error",
        'a2s.address must be a valid IPv4 on disk (use empty/0.0.0.0 in panel — saved as 0.0.0.0, not "" or public IP)',
        "config",
      ),
    );
  } else if (publicAddress && a2sAddress === publicAddress) {
    checks.push(
      check(
        "a2s-not-public",
        "A2S bind is not public IP",
        "error",
        `a2s.address must bind locally (0.0.0.0), not publicAddress (${publicAddress}) — causes A2S/browser issues per Bohemia docs`,
        "config",
      ),
    );
  } else {
    checks.push(
      check(
        "a2s-address-schema",
        "A2S bind address (game schema)",
        "ok",
        `Will write a2s.address=${a2sAddress} (bind interface, not registration IP)`,
        "config",
      ),
    );
  }

  const rawA2s = config.a2s?.address?.trim() ?? "";
  const rawPublic = config.publicAddress?.trim() ?? "";
  if (rawA2s && rawPublic && rawA2s === rawPublic) {
    checks.push(
      check(
        "a2s-raw-public",
        "A2S field in saved config",
        "warn",
        "Form still has public IP in A2S bind — will be corrected on save/start",
        "config",
      ),
    );
  }

  if (!publicAddress || !IPV4_PATTERN.test(publicAddress)) {
    checks.push(
      check(
        "public-address",
        "Public registration IP",
        "error",
        "publicAddress must be your reachable public IPv4 for browser registration and direct connect (Bohemia backend)",
        "config",
      ),
    );
  } else {
    checks.push(
      check(
        "public-address",
        "Public registration IP",
        "ok",
        `publicAddress=${publicAddress}`,
        "config",
      ),
    );
  }

  if (!config.game.scenarioId?.trim()) {
    checks.push(
      check("scenario", "Scenario selected", "error", "game.scenarioId is required", "config"),
    );
  } else {
    checks.push(
      check("scenario", "Scenario selected", "ok", config.game.scenarioId, "config"),
    );
  }

  if (ports.game < 1024 || ports.game > 65535) {
    checks.push(
      check(
        "game-port",
        "Game port",
        "error",
        `publicPort ${ports.game || "(missing)"} must be 1024–65535`,
        "config",
      ),
    );
  } else {
    checks.push(
      check("game-port", "Game port", "ok", `UDP ${ports.game} (forward on router/provider firewall)`, "config"),
    );
  }

  if (!ports.a2s || ports.a2s < 1024) {
    checks.push(
      check("a2s-port", "A2S query port", "error", "A2S port missing or invalid", "config"),
    );
  } else {
    checks.push(
      check(
        "a2s-port",
        "A2S query port",
        "ok",
        `UDP ${ports.a2s} — open alongside game port for server browser queries`,
        "config",
      ),
    );
  }

  const rconPassword = config.rcon?.password?.trim() ?? "";
  if (rconPassword && rconPassword.length < 3) {
    checks.push(
      check(
        "rcon-password",
        "RCon password",
        "error",
        "rcon.password must be at least 3 characters or left empty (block omitted on disk)",
        "config",
      ),
    );
  }

  const rconAddress = resolveBindAddressForDisk(config.rcon?.address, publicAddress);
  if (rconPassword.length >= 3 && !IPV4_PATTERN.test(rconAddress)) {
    checks.push(
      check("rcon-address", "RCon bind address", "error", "rcon.address must be valid IPv4 when RCon is enabled", "config"),
    );
  }

  if (config.game.visible === false) {
    checks.push(
      check(
        "visible",
        "Server browser listing",
        "warn",
        "game.visible is false — direct connect only",
        "config",
      ),
    );
  }

  return checks;
}

export function buildNetworkPreflightChecks(input: {
  ufwActive: boolean | null;
  ufwAvailable: boolean;
  gamePortOpen: boolean | null;
  a2sPortOpen: boolean | null;
  gamePort: number;
  a2sPort: number;
}): PreflightCheck[] {
  const checks: PreflightCheck[] = [];

  if (!input.ufwAvailable) {
    checks.push(
      check(
        "ufw-installed",
        "UFW firewall",
        "warn",
        "UFW not installed — ensure OVH/provider firewall allows UDP game and A2S ports",
        "network",
      ),
    );
    return checks;
  }

  if (input.ufwActive === false) {
    checks.push(
      check(
        "ufw-active",
        "UFW active",
        "warn",
        "UFW is inactive — OK if provider firewall opens UDP ports; otherwise players cannot connect",
        "network",
      ),
    );
  } else if (input.ufwActive === true) {
    checks.push(check("ufw-active", "UFW active", "ok", "UFW is enabled", "network"));

    if (input.gamePortOpen === false) {
      checks.push(
        check(
          "ufw-game-port",
          `UFW allows game UDP ${input.gamePort}`,
          "error",
          `Port ${input.gamePort}/udp not in UFW — use Apply UFW rules on Network tab`,
          "network",
        ),
      );
    } else if (input.gamePortOpen === true) {
      checks.push(
        check(
          "ufw-game-port",
          `UFW allows game UDP ${input.gamePort}`,
          "ok",
          `Rule found for ${input.gamePort}/udp`,
          "network",
        ),
      );
    }

    if (input.a2sPortOpen === false) {
      checks.push(
        check(
          "ufw-a2s-port",
          `UFW allows A2S UDP ${input.a2sPort}`,
          "warn",
          `Port ${input.a2sPort}/udp not in UFW — server browser queries may fail (direct connect still works on game port)`,
          "network",
        ),
      );
    } else if (input.a2sPortOpen === true) {
      checks.push(
        check(
          "ufw-a2s-port",
          `UFW allows A2S UDP ${input.a2sPort}`,
          "ok",
          `Rule found for ${input.a2sPort}/udp`,
          "network",
        ),
      );
    }
  }

  return checks;
}

export function buildHostPreflightChecks(input: {
  gameInstalled: boolean;
  branch: string;
  outboundSteam: boolean | null;
  outboundSteamStatic: boolean | null;
  dnsBohemia: boolean | null;
  maxFps: number | null;
}): PreflightCheck[] {
  const checks: PreflightCheck[] = [];

  if (!input.gameInstalled) {
    checks.push(
      check(
        "game-binary",
        "Game server installed",
        "error",
        `${input.branch} server binary missing — install from Game page (SteamCMD app 1874900 stable / 1890870 experimental)`,
        "host",
      ),
    );
  } else {
    checks.push(
      check("game-binary", "Game server installed", "ok", `${input.branch} binary present`, "host"),
    );
  }

  if (input.outboundSteam === false) {
    checks.push(
      check(
        "outbound-steam",
        "Outbound HTTPS (Steam)",
        "error",
        "Cannot reach steamcommunity.com — Bohemia backend registration will fail (RoomsRegisterS2S timeout)",
        "host",
      ),
    );
  } else if (input.outboundSteam === true) {
    checks.push(
      check("outbound-steam", "Outbound HTTPS (Steam)", "ok", "steamcommunity.com reachable", "host"),
    );
  }

  if (input.outboundSteamStatic === false) {
    checks.push(
      check(
        "outbound-steamstatic",
        "Outbound HTTPS (Steam CDN)",
        "warn",
        "Cannot reach client-update.steamstatic.com — updates/downloads may fail",
        "host",
      ),
    );
  } else if (input.outboundSteamStatic === true) {
    checks.push(
      check("outbound-steamstatic", "Outbound HTTPS (Steam CDN)", "ok", "Steam CDN reachable", "host"),
    );
  }

  if (input.dnsBohemia === false) {
    checks.push(
      check(
        "dns-bohemia",
        "DNS resolution",
        "error",
        "Cannot resolve api.bistudio.com — fix DNS (/etc/resolv.conf) or registration will fail",
        "host",
      ),
    );
  } else if (input.dnsBohemia === true) {
    checks.push(check("dns-bohemia", "DNS resolution", "ok", "api.bistudio.com resolves", "host"));
  }

  const fps = input.maxFps ?? 0;
  if (fps < 30 || fps > 120) {
    checks.push(
      check(
        "max-fps",
        "Server maxFPS",
        "warn",
        `maxFPS is ${fps || "unset"} — Bohemia recommends 60–120 via -maxFPS to avoid using all CPU`,
        "host",
      ),
    );
  } else {
    checks.push(check("max-fps", "Server maxFPS", "ok", `maxFPS=${fps}`, "host"));
  }

  return checks;
}

export function mergePreflightReport(checks: PreflightCheck[]): PreflightReport {
  const errorCount = checks.filter((c) => c.severity === "error").length;
  const warnCount = checks.filter((c) => c.severity === "warn").length;
  return {
    checks,
    canStart: errorCount === 0,
    canUpdateGame: !checks.some((c) => c.severity === "error" && c.id.startsWith("outbound")),
    errorCount,
    warnCount,
  };
}

export function preflightSummary(report: PreflightReport): string {
  if (report.canStart) return "";
  return report.checks
    .filter((c) => c.severity === "error")
    .map((c) => c.label)
    .join("; ");
}

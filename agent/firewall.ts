import { execSync } from "child_process";
import { buildUfwRules, resolveInstancePorts } from "../lib/shared/network-ports";
import type { ServerConfig } from "../lib/shared/config-schema";

const REFORGER_CTL = "/usr/local/bin/reforger-ctl";

export function ufwStatus() {
  try {
    const output = execSync("sudo -n ufw status numbered 2>/dev/null || ufw status numbered", {
      encoding: "utf8",
    });
    return { ok: true, output };
  } catch (err) {
    return { ok: false, output: err instanceof Error ? err.message : String(err) };
  }
}

export function applyUfwRules(config: ServerConfig, slug: string) {
  const ports = resolveInstancePorts(config);
  const rules = buildUfwRules(ports, slug);
  const applied: string[] = [];
  const errors: string[] = [];

  for (const rule of rules) {
    if (!rule.trim() || rule.trim().startsWith("#")) continue;
    try {
      execSync(`sudo -n ${rule}`, { encoding: "utf8", shell: "/bin/bash" });
      applied.push(rule);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  return { applied, errors, rules };
}

export function firewallAvailable() {
  try {
    execSync("command -v ufw", { encoding: "utf8" });
    return true;
  } catch {
    return false;
  }
}

export { REFORGER_CTL };

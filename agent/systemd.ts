import { execFileSync, spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { HttpError } from "../lib/shared/http-error";
import type { InstanceRecord } from "../lib/shared/types";
import { buildLaunchShell, getServerBinary } from "../lib/shared/startup-params";
import { agentConfig } from "./config";

const TEMPLATE_UNIT = "/etc/systemd/system/reforger@.service";
const CTL = "/usr/local/bin/reforger-ctl";

export function systemdUnitName(instance: InstanceRecord) {
  return `reforger@${instance.slug}.service`;
}

function startScriptPath(instance: InstanceRecord) {
  return path.join(agentConfig.instancesDir, instance.slug, "start.sh");
}

export function ensureSystemdTemplate() {
  if (!fs.existsSync(TEMPLATE_UNIT)) {
    throw new HttpError(
      503,
      "Systemd template missing. Run once on the server: sudo bash scripts/bootstrap-host.sh",
    );
  }
  if (!fs.existsSync(CTL)) {
    throw new HttpError(
      503,
      "reforger-ctl not installed. Run once on the server: sudo bash scripts/bootstrap-host.sh",
    );
  }
}

function ensureDirPermissions(dir: string) {
  if (!fs.existsSync(dir)) return;
  try {
    execFileSync("chgrp", ["-R", "reforger", dir], { stdio: "ignore" });
    execFileSync("chmod", ["-R", "g+rwX", dir], { stdio: "ignore" });
  } catch {
    /* agent may lack permission; bootstrap-host.sh sets base ownership */
  }
}

export function ensureInstancePermissions(instance: InstanceRecord) {
  const instanceRoot = path.dirname(instance.configPath);
  ensureDirPermissions(instanceRoot);
  ensureDirPermissions(instance.profilePath);
  ensureDirPermissions(instance.battleyePath);
  ensureDirPermissions(instance.addonTempDir);
  ensureDirPermissions(path.dirname(startScriptPath(instance)));
}

export function writeInstanceStartScript(instance: InstanceRecord, launchShell: string) {
  ensureSystemdTemplate();
  const scriptPath = startScriptPath(instance);
  const scriptDir = path.dirname(scriptPath);
  fs.mkdirSync(scriptDir, { recursive: true });
  const serverDir = path.dirname(getServerBinary(instance.branch));
  const content = `#!/bin/bash
set -euo pipefail
cd ${JSON.stringify(serverDir)}
exec ${launchShell}
`;
  fs.writeFileSync(scriptPath, content, { mode: 0o755 });
  ensureInstancePermissions(instance);
}

export function removeInstanceStartScript(instance: InstanceRecord) {
  const scriptPath = startScriptPath(instance);
  const scriptDir = path.dirname(scriptPath);
  if (fs.existsSync(scriptPath)) fs.unlinkSync(scriptPath);
  try {
    if (fs.existsSync(scriptDir) && fs.readdirSync(scriptDir).length === 0) fs.rmdirSync(scriptDir);
  } catch {
    /* ignore */
  }
}

export function startInstance(instance: InstanceRecord) {
  return runCtl("start", systemdUnitName(instance));
}

export function stopInstance(instance: InstanceRecord) {
  return runCtl("stop", systemdUnitName(instance));
}

export function restartInstance(instance: InstanceRecord) {
  return runCtl("restart", systemdUnitName(instance));
}

export function getInstanceSystemdStatus(instance: InstanceRecord) {
  const result = runCtl("is-active", systemdUnitName(instance));
  return result.stdout.trim();
}

export function isActive(instance: InstanceRecord) {
  return getInstanceSystemdStatus(instance) === "active";
}

function runCtl(action: string, unit: string, extraArgs: string[] = []) {
  if (!fs.existsSync(CTL)) {
    return {
      ok: false,
      stdout: "",
      stderr: "reforger-ctl not installed. Run: sudo bash scripts/bootstrap-host.sh",
    };
  }
  const result = spawnSync("sudo", ["-n", CTL, action, unit, ...extraArgs], { encoding: "utf8" });
  let stderr = (result.stderr ?? "").trim();
  if (!result.ok && (stderr.includes("password") || stderr.includes("sudo"))) {
    stderr =
      "sudo permission denied for reforger-ctl. Run once: sudo bash scripts/bootstrap-host.sh";
  }
  return {
    ok: result.status === 0,
    stdout: (result.stdout ?? "").trim(),
    stderr,
  };
}

export function writePanelUnits(projectRoot: string) {
  const agentUnit = `[Unit]
Description=Reforger Panel Agent
After=network.target

[Service]
Type=simple
User=${agentConfig.runAsUser}
WorkingDirectory=${projectRoot}
EnvironmentFile=-/etc/reforgerpanel/env
ExecStart=/usr/bin/npm run agent
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
`;

  const webUnit = `[Unit]
Description=Reforger Panel Web
After=network.target reforgerpanel-agent.service

[Service]
Type=simple
User=${agentConfig.runAsUser}
WorkingDirectory=${projectRoot}
EnvironmentFile=-/etc/reforgerpanel/env
ExecStart=/usr/bin/npm run start
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
`;

  fs.writeFileSync("/etc/systemd/system/reforgerpanel-agent.service", agentUnit);
  fs.writeFileSync("/etc/systemd/system/reforgerpanel.service", webUnit);
  execFileSync("systemctl", ["daemon-reload"], { stdio: "ignore" });
}

export { buildLaunchShell };

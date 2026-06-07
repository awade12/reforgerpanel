import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { INSTANCES_DIR } from "../lib/shared/constants";

const RM_HELPER = "/usr/local/bin/reforger-rm-path";

function instancesRoot() {
  return path.resolve(process.env.REFORGER_INSTANCES_DIR ?? INSTANCES_DIR);
}

export function assertUnderInstancesDir(target: string) {
  const root = instancesRoot();
  const resolved = path.resolve(target);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("Path is outside instances directory");
  }
  return resolved;
}

export function removeInstancePath(target: string) {
  const resolved = assertUnderInstancesDir(target);
  if (!fs.existsSync(resolved)) return;

  try {
    fs.rmSync(resolved, { recursive: true, force: true });
    return;
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? String(err.code) : "";
    if (code !== "EACCES" && code !== "EPERM") throw err;
  }

  if (!fs.existsSync(RM_HELPER)) {
    throw new Error(
      "Permission denied removing mod files — run on the host: sudo bash /opt/reforgerpanel/scripts/bootstrap-host.sh",
    );
  }

  const result = spawnSync("sudo", ["-n", RM_HELPER, resolved], { encoding: "utf8" });
  if (result.status !== 0) {
    const detail = (result.stderr ?? result.stdout ?? "").trim();
    throw new Error(
      detail ||
        "Permission denied removing mod files — update sudoers: sudo cp /opt/reforgerpanel/deploy/reforgerpanel.sudoers /etc/sudoers.d/reforgerpanel && sudo visudo -cf /etc/sudoers.d/reforgerpanel",
    );
  }
}

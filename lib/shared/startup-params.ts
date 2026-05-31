import type { Branch, InstanceRecord } from "./types";
import { SERVER_EXP_DIR, SERVER_STABLE_DIR } from "./constants";

export interface LaunchOptions {
  instance: InstanceRecord;
  configPath: string;
  profilePath: string;
  addonTempDir: string;
  maxFps: number;
  logStatsMs?: number | null;
  logLevel?: string | null;
  backendlog?: boolean;
  nothrow?: boolean;
  devServer?: string | null;
  addonsDir?: string | null;
  addons?: string[];
}

export function getServerBinary(branch: Branch): string {
  const dir = branch === "stable" ? SERVER_STABLE_DIR : SERVER_EXP_DIR;
  return `${dir}/ArmaReforgerServer`;
}

export function buildLaunchCommand(opts: LaunchOptions): string[] {
  const binary = getServerBinary(opts.instance.branch);
  const args = [binary];

  if (opts.devServer) {
    args.push("-server", opts.devServer);
    if (opts.addonsDir) args.push("-addonsDir", opts.addonsDir);
    if (opts.addons?.length) args.push("-addons", ...opts.addons);
  } else {
    args.push("-config", opts.configPath);
  }

  args.push("-profile", opts.profilePath);
  args.push("-bepath", opts.instance.battleyePath);
  args.push("-maxFPS", String(opts.maxFps));
  args.push("-addonTempDir", opts.addonTempDir);

  if (opts.logStatsMs && opts.logStatsMs > 0) {
    args.push("-logStats", String(opts.logStatsMs));
  }
  if (opts.logLevel) {
    args.push("-logLevel", opts.logLevel);
  }
  if (opts.backendlog) args.push("-backendlog");
  if (opts.nothrow) args.push("-nothrow");

  return args;
}

export function buildLaunchShell(opts: LaunchOptions): string {
  return buildLaunchCommand(opts)
    .map((part) => (/\s|[\"'$`]/.test(part) ? `"${part.replace(/"/g, '\\"')}"` : part))
    .join(" ");
}

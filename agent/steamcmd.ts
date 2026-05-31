import { spawn, execSync } from "child_process";
import fs from "fs";
import path from "path";
import { APP_ID_EXPERIMENTAL, APP_ID_STABLE } from "../lib/shared/constants";
import { HttpError } from "../lib/shared/http-error";
import type { Branch, GameInstallStatus } from "../lib/shared/types";
import { agentConfig } from "./config";
import { notifyGameUpdate } from "./alerts";

export type InstallProgressHandler = (line: string) => void;

export interface InstallJobState {
  running: boolean;
  branch: Branch | null;
  ok: boolean | null;
  lines: string[];
  output: string;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
}

let installJob: InstallJobState = {
  running: false,
  branch: null,
  ok: null,
  lines: [],
  output: "",
  startedAt: null,
  finishedAt: null,
  error: null,
};

export function getInstallJob(): InstallJobState {
  return { ...installJob, lines: [...installJob.lines] };
}

function installDir(branch: Branch) {
  return branch === "stable" ? agentConfig.serverStableDir : agentConfig.serverExpDir;
}

function appId(branch: Branch) {
  return branch === "stable" ? APP_ID_STABLE : APP_ID_EXPERIMENTAL;
}

function binaryPath(branch: Branch) {
  return path.join(installDir(branch), "ArmaReforgerServer");
}

export function getGameInstallStatus(): GameInstallStatus {
  const stableBinary = binaryPath("stable");
  const expBinary = binaryPath("experimental");
  return {
    stable: {
      installed: fs.existsSync(stableBinary),
      path: agentConfig.serverStableDir,
      binary: fs.existsSync(stableBinary) ? stableBinary : null,
    },
    experimental: {
      installed: fs.existsSync(expBinary),
      path: agentConfig.serverExpDir,
      binary: fs.existsSync(expBinary) ? expBinary : null,
    },
  };
}

export function ensureReforgerDirs() {
  for (const dir of [
    agentConfig.reforgerRoot,
    agentConfig.steamHome,
    agentConfig.instancesDir,
    agentConfig.missionsDir,
    path.join(agentConfig.reforgerRoot, "local-mods"),
    agentConfig.serverStableDir,
    agentConfig.serverExpDir,
    path.dirname(agentConfig.steamcmd),
  ]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function steamEnv() {
  return {
    ...process.env,
    HOME: agentConfig.steamHome,
  };
}

function finalizeInstall(branch: Branch) {
  const binary = binaryPath(branch);
  if (fs.existsSync(binary)) {
    fs.chmodSync(binary, 0o755);
  }
  try {
    execSync(`chown -R reforger:reforger ${installDir(branch)}`, { stdio: "ignore" });
  } catch {
    /* needs root; game may still run if ubuntu-owned */
  }
}

export async function runSteamCmd(args: string[], onLine?: InstallProgressHandler): Promise<{ ok: boolean; output: string }> {
  ensureReforgerDirs();

  let steamcmd = agentConfig.steamcmd;
  if (fs.existsSync(steamcmd)) {
    try {
      steamcmd = fs.realpathSync(steamcmd);
    } catch {
      /* use configured path */
    }
  }

  if (!fs.existsSync(steamcmd)) {
    return {
      ok: false,
      output: `SteamCMD not found at ${agentConfig.steamcmd}. Run: sudo bash scripts/bootstrap-host.sh`,
    };
  }

  return new Promise((resolve) => {
    const chunks: string[] = [];
    const child = spawn(steamcmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: path.dirname(steamcmd),
      env: steamEnv(),
    });

    const handle = (data: Buffer) => {
      const text = data.toString();
      chunks.push(text);
      for (const line of text.split("\n")) {
        if (line.trim()) onLine?.(line);
      }
    };

    child.stdout.on("data", handle);
    child.stderr.on("data", handle);
    child.on("close", (code) => {
      resolve({ ok: code === 0, output: chunks.join("") });
    });
    child.on("error", (err) => resolve({ ok: false, output: String(err) }));
  });
}

export async function installOrUpdate(branch: Branch, onLine?: InstallProgressHandler): Promise<{ ok: boolean; output: string }> {
  ensureReforgerDirs();
  const dir = installDir(branch);
  const args = [
    `+force_install_dir`,
    dir,
    `+login`,
    "anonymous",
    `+app_update`,
    String(appId(branch)),
    "validate",
    "+quit",
  ];
  const result = await runSteamCmd(args, onLine);
  finalizeInstall(branch);
  const installed = fs.existsSync(binaryPath(branch));
  return {
    ok: installed || result.ok,
    output: result.output,
  };
}

export function startInstallJob(branch: Branch): InstallJobState {
  if (installJob.running) {
    throw new HttpError(
      409,
      `Install already running for ${installJob.branch ?? "unknown"} branch. Wait for it to finish.`,
    );
  }

  installJob = {
    running: true,
    branch,
    ok: null,
    lines: ["Starting SteamCMD install..."],
    output: "",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    error: null,
  };

  void installOrUpdate(branch, (line) => {
    installJob.lines.push(line);
    if (installJob.lines.length > 500) installJob.lines.shift();
  })
    .then((result) => {
      installJob.running = false;
      installJob.ok = result.ok;
      installJob.output = result.output;
      installJob.finishedAt = new Date().toISOString();
      if (!result.ok) {
        installJob.error =
          "SteamCMD did not finish cleanly. Check output below. If bootstrap failed, run once on the server: sudo bash scripts/bootstrap-host.sh";
      }
      void notifyGameUpdate(
        branch,
        result.ok,
        result.ok ? `${branch} server install/update finished` : `${branch} server install/update failed`,
      );
    })
    .catch((err) => {
      installJob.running = false;
      installJob.ok = false;
      installJob.error = err instanceof Error ? err.message : String(err);
      installJob.finishedAt = new Date().toISOString();
    });

  return getInstallJob();
}

export async function repairBattleye(branch: Branch, onLine?: InstallProgressHandler) {
  return installOrUpdate(branch, onLine);
}

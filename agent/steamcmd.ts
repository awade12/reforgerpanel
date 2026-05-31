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

let activeSteamChild: ReturnType<typeof spawn> | null = null;

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

function steamEnv(steamRoot: string) {
  const libPath = path.join(steamRoot, "linux32");
  const prev = process.env.LD_LIBRARY_PATH;
  return {
    ...process.env,
    HOME: agentConfig.steamHome,
    LD_LIBRARY_PATH: prev ? `${libPath}:${prev}` : libPath,
    SDL_VIDEODRIVER: "dummy",
  };
}

function resolveSteamCmd(): { script: string; root: string; binary: string } | null {
  let script = agentConfig.steamcmd;
  if (fs.existsSync(script)) {
    try {
      script = fs.realpathSync(script);
    } catch {
      /* use configured path */
    }
  }
  if (!fs.existsSync(script)) return null;
  const root = path.dirname(script);
  const binary = path.join(root, "linux32", "steamcmd");
  return { script, root, binary };
}

function canWriteDir(dir: string) {
  try {
    fs.accessSync(dir, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
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

function dockerMountDir(args: string[]) {
  const idx = args.indexOf("+force_install_dir");
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : agentConfig.serverStableDir;
}

function dockerInnerArgs(args: string[]) {
  return args.map((arg, i) => (args[i - 1] === "+force_install_dir" ? "/data" : arg));
}

function spawnSteamCmd(
  command: string,
  commandArgs: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv },
  onLine: InstallProgressHandler | undefined,
): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    const chunks: string[] = [];
    let lastOutput = Date.now();
    const heartbeat = setInterval(() => {
      if (Date.now() - lastOutput >= 30000) {
        onLine?.("Still running… (large downloads can take 20–40 minutes)");
        lastOutput = Date.now();
      }
    }, 30000);

    const child = spawn(command, commandArgs, {
      stdio: ["pipe", "pipe", "pipe"],
      cwd: options.cwd,
      env: options.env,
    });
    activeSteamChild = child;
    child.stdin?.end();

    const handle = (data: Buffer) => {
      lastOutput = Date.now();
      const text = data.toString();
      chunks.push(text);
      for (const line of text.split("\n")) {
        if (line.trim()) onLine?.(line);
      }
    };

    child.stdout.on("data", handle);
    child.stderr.on("data", handle);
    child.on("close", (code) => {
      clearInterval(heartbeat);
      activeSteamChild = null;
      resolve({ ok: code === 0, output: chunks.join("") });
    });
    child.on("error", (err) => {
      clearInterval(heartbeat);
      activeSteamChild = null;
      resolve({ ok: false, output: String(err) });
    });
  });
}

async function runSteamCmdDocker(args: string[], onLine?: InstallProgressHandler): Promise<{ ok: boolean; output: string }> {
  const mountDir = dockerMountDir(args);
  const inner = dockerInnerArgs(args);
  onLine?.(`Docker SteamCMD (${agentConfig.steamDockerImage}) → ${mountDir}`);
  return spawnSteamCmd(
    "sudo",
    ["-n", "docker", "run", "--rm", "-v", `${mountDir}:/data`, agentConfig.steamDockerImage, ...inner],
    { env: process.env },
    onLine,
  );
}

export async function runSteamCmd(args: string[], onLine?: InstallProgressHandler): Promise<{ ok: boolean; output: string }> {
  ensureReforgerDirs();

  if (agentConfig.steamUseDocker) {
    return runSteamCmdDocker(args, onLine);
  }

  const resolved = resolveSteamCmd();
  if (!resolved) {
    return {
      ok: false,
      output: `SteamCMD not found at ${agentConfig.steamcmd}. Run: sudo bash scripts/bootstrap-host.sh`,
    };
  }

  const { script, root, binary } = resolved;
  if (!fs.existsSync(binary)) {
    return {
      ok: false,
      output: `SteamCMD binary missing at ${binary}. Re-run: sudo bash scripts/bootstrap-host.sh`,
    };
  }

  if (!canWriteDir(agentConfig.steamHome)) {
    return {
      ok: false,
      output: `Cannot write to STEAM home ${agentConfig.steamHome}. Run: sudo chown ubuntu:reforger ${agentConfig.steamHome}`,
    };
  }

  onLine?.(`SteamCMD: ${script}`);
  onLine?.(`HOME=${agentConfig.steamHome}`);

  return spawnSteamCmd("/bin/bash", [script, ...args], { cwd: root, env: steamEnv(root) }, onLine);
}

export async function installOrUpdate(branch: Branch, onLine?: InstallProgressHandler): Promise<{ ok: boolean; output: string }> {
  ensureReforgerDirs();
  const dir = installDir(branch);
  if (!canWriteDir(dir)) {
    onLine?.(`Warning: may not be able to write to ${dir} — ensure user ${agentConfig.runAsUser} is in group reforger`);
  }
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

export function cancelInstallJob(): InstallJobState {
  if (activeSteamChild) {
    activeSteamChild.kill("SIGKILL");
    activeSteamChild = null;
  }
  if (installJob.running) {
    installJob.running = false;
    installJob.ok = false;
    installJob.error = "Install cancelled";
    installJob.finishedAt = new Date().toISOString();
    installJob.lines.push("Install cancelled.");
  }
  return getInstallJob();
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

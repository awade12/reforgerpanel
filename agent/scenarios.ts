import { spawn } from "child_process";
import fs from "fs";
import { OFFICIAL_SCENARIOS } from "../lib/shared/constants";
import type { Branch } from "../lib/shared/types";
import { getServerBinary } from "../lib/shared/startup-params";
import { agentConfig } from "./config";
import { getGameInstallStatus } from "./steamcmd";

export interface ScenarioEntry {
  id: string;
  name: string;
  source: string;
}

const DISCOVERY_TIMEOUT_MS = 120_000;
const discovering = new Map<Branch, Promise<ScenarioEntry[]>>();

export function listOfficialScenarios(): ScenarioEntry[] {
  return OFFICIAL_SCENARIOS.map((s) => ({ id: s.id, name: s.name, source: s.source }));
}

function parseScenarioOutput(output: string): ScenarioEntry[] {
  const scenarios: ScenarioEntry[] = [...listOfficialScenarios()];
  for (const line of output.split("\n")) {
    const match = line.match(/:\s*(\{[A-F0-9]+\}[^\s]+)\s*(?:\((.+)\))?/i);
    if (!match) continue;
    const id = match[1];
    if (scenarios.some((s) => s.id === id)) continue;
    scenarios.push({
      id,
      name: match[2]?.trim() || id.split("/").pop() || id,
      source: line.toLowerCase().includes("workshop") ? "Workshop" : "Discovered",
    });
  }
  return scenarios;
}

export function saveScenarioCache(branch: Branch, scenarios: ScenarioEntry[]) {
  fs.mkdirSync(agentConfig.dataDir, { recursive: true });
  fs.writeFileSync(`${agentConfig.dataDir}/scenarios-${branch}.json`, JSON.stringify(scenarios, null, 2));
}

export function loadScenarioCache(branch: Branch): ScenarioEntry[] | null {
  const file = `${agentConfig.dataDir}/scenarios-${branch}.json`;
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8")) as ScenarioEntry[];
}

export function ensureScenarioCache(branch: Branch = "stable") {
  if (loadScenarioCache(branch)) return;
  saveScenarioCache(branch, listOfficialScenarios());
}

export function getScenarios(branch: Branch = "stable"): ScenarioEntry[] {
  return loadScenarioCache(branch) ?? listOfficialScenarios();
}

export function discoverScenariosAsync(branch: Branch = "stable"): Promise<ScenarioEntry[]> {
  const existing = discovering.get(branch);
  if (existing) return existing;

  const job = new Promise<ScenarioEntry[]>((resolve) => {
    const install = getGameInstallStatus();
    const branchInfo = branch === "stable" ? install.stable : install.experimental;
    if (!branchInfo.binary) {
      const official = listOfficialScenarios();
      saveScenarioCache(branch, official);
      resolve(official);
      return;
    }

    const child = spawn(branchInfo.binary!, ["-listScenarios"], {
      cwd: branchInfo.path,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const chunks: string[] = [];
    child.stdout?.on("data", (data: Buffer) => chunks.push(data.toString()));
    child.stderr?.on("data", (data: Buffer) => chunks.push(data.toString()));

    let settled = false;
    const finish = (scenarios: ScenarioEntry[]) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      saveScenarioCache(branch, scenarios);
      resolve(scenarios);
    };

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      console.warn(`[agent] scenario discovery timed out for ${branch}`);
      finish(getScenarios(branch));
    }, DISCOVERY_TIMEOUT_MS);

    child.on("error", (err) => {
      console.warn("[agent] scenario discovery failed:", err.message);
      finish(getScenarios(branch));
    });

    child.on("close", () => {
      finish(parseScenarioOutput(chunks.join("")));
    });
  }).finally(() => {
    discovering.delete(branch);
  });

  discovering.set(branch, job);
  return job;
}

export function queueScenarioDiscovery(branch: Branch = "stable") {
  void discoverScenariosAsync(branch).catch(() => undefined);
}

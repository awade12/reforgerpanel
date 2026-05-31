import fs from "fs";
import path from "path";
import { SERVER_EXP_DIR, SERVER_STABLE_DIR } from "../lib/shared/constants";
import type { InstanceRecord } from "../lib/shared/types";
import { getInstance, updateInstance } from "./db";

const PROTECTED_KEYS = new Set(["GameID", "MasterPort"]);

export function resolveBattleyePath(instance: InstanceRecord) {
  return path.join(instance.profilePath, "battleye");
}

export function ensureBattleyePath(instance: InstanceRecord): InstanceRecord {
  const correct = resolveBattleyePath(instance);
  fs.mkdirSync(correct, { recursive: true });

  if (instance.battleyePath !== correct) {
    const old = instance.battleyePath;
    if (old && old !== correct && fs.existsSync(old)) {
      const oldCfg = path.join(old, "BEServer_x64.cfg");
      const newCfg = path.join(correct, "BEServer_x64.cfg");
      if (fs.existsSync(oldCfg) && !fs.existsSync(newCfg)) {
        fs.copyFileSync(oldCfg, newCfg);
      }
    }
    updateInstance(instance.id, { battleyePath: correct });
    return { ...instance, battleyePath: correct };
  }

  return instance;
}

export function getBattleyeConfigPath(instance: InstanceRecord) {
  return path.join(ensureBattleyePath(instance).battleyePath, "BEServer_x64.cfg");
}

function getInstallBattleyeConfigPath(instance: InstanceRecord) {
  const root = instance.branch === "stable" ? SERVER_STABLE_DIR : SERVER_EXP_DIR;
  return path.join(root, "battleye", "BEServer_x64.cfg");
}

export function bootstrapBattleyeConfig(instance: InstanceRecord) {
  const instanceCfg = getBattleyeConfigPath(instance);
  if (fs.existsSync(instanceCfg) && fs.readFileSync(instanceCfg, "utf8").trim()) {
    return instanceCfg;
  }

  const installCfg = getInstallBattleyeConfigPath(instance);
  if (fs.existsSync(installCfg)) {
    fs.mkdirSync(path.dirname(instanceCfg), { recursive: true });
    fs.copyFileSync(installCfg, instanceCfg);
    return instanceCfg;
  }

  return instanceCfg;
}

export function readBattleyeConfig(instanceId: string) {
  const raw = getInstance(instanceId);
  if (!raw) throw new Error("Instance not found");
  const instance = ensureBattleyePath(raw);
  const file = bootstrapBattleyeConfig(instance);
  if (!fs.existsSync(file)) return { content: "", path: file, rconPort: null as number | null, rconPassword: null as string | null };
  const content = fs.readFileSync(file, "utf8");
  const rconPortMatch = content.match(/^RConPort\s+(\d+)\s*$/m);
  const rconPasswordMatch = content.match(/^RConPassword\s+(.+)\s*$/m);
  return {
    content,
    path: file,
    rconPort: rconPortMatch ? Number(rconPortMatch[1]) : null,
    rconPassword: rconPasswordMatch ? rconPasswordMatch[1].trim() : null,
  };
}

export function appendBattleyeSettings(instanceId: string, rconPort: number, rconPassword: string) {
  const raw = getInstance(instanceId);
  if (!raw) throw new Error("Instance not found");
  const instance = ensureBattleyePath(raw);
  if (rconPassword.includes(" ") || rconPassword.length < 3) {
    throw new Error("RCon password must be at least 3 characters with no spaces");
  }
  const file = bootstrapBattleyeConfig(instance);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let content = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  for (const line of content.split("\n")) {
    const key = line.trim().split(/\s+/)[0];
    if (key && PROTECTED_KEYS.has(key)) continue;
    if (/^RConPort\s+/i.test(line) || /^RConPassword\s+/i.test(line)) {
      content = content
        .split("\n")
        .filter((l) => !/^RConPort\s+/i.test(l) && !/^RConPassword\s+/i.test(l))
        .join("\n");
      break;
    }
  }
  const additions = [`RConPort ${rconPort}`, `RConPassword ${rconPassword}`].join("\n");
  const next = `${content.trim()}\n${additions}\n`;
  fs.writeFileSync(file, next);
  return readBattleyeConfig(instanceId);
}

export function validateBattleyeConfig(instanceId: string): string[] {
  const raw = getInstance(instanceId);
  if (!raw) throw new Error("Instance not found");
  const instance = ensureBattleyePath(raw);
  bootstrapBattleyeConfig(instance);
  const file = getBattleyeConfigPath(instance);
  if (!fs.existsSync(file)) return ["BattlEye config file missing — start the server once to generate GameID/MasterPort"];
  const content = fs.readFileSync(file, "utf8");
  const warnings: string[] = [];
  if (!/GameID/i.test(content)) warnings.push("Missing GameID — players may be kicked with “Missing GameID/MasterPort server config settings”");
  if (!/MasterPort/i.test(content)) warnings.push("Missing MasterPort — players may be kicked with “Missing GameID/MasterPort server config settings”");
  return warnings;
}

export function deleteBattleyeConfig(instanceId: string) {
  const raw = getInstance(instanceId);
  if (!raw) throw new Error("Instance not found");
  const instance = ensureBattleyePath(raw);
  const file = getBattleyeConfigPath(instance);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

import { buildRegistrationDiagnostics } from "../lib/shared/network-ports";
import type { InstanceRecord } from "../lib/shared/types";
import { queryInstanceA2s } from "./a2s";
import { validateBattleyeConfig } from "./battleye";
import { readInstanceConfig } from "./instances";
import { checkConfiguredMods } from "./mods";

export type InstanceDiagnostics = {
  registration: ReturnType<typeof buildRegistrationDiagnostics>;
  battleyeWarnings: string[];
  modChecks: ReturnType<typeof checkConfiguredMods>;
  a2s: Awaited<ReturnType<typeof queryInstanceA2s>> | null;
};

export async function getInstanceDiagnostics(instance: InstanceRecord): Promise<InstanceDiagnostics> {
  const config = readInstanceConfig(instance);
  let a2s = null;
  if (instance.status === "running") {
    a2s = await queryInstanceA2s(instance);
  }
  const registration = buildRegistrationDiagnostics(config, a2s?.listed ?? null);
  return {
    registration,
    battleyeWarnings: validateBattleyeConfig(instance.id),
    modChecks: checkConfiguredMods(instance),
    a2s,
  };
}

export function collectStartWarnings(instance: InstanceRecord) {
  const config = readInstanceConfig(instance);
  const warnings: string[] = [];
  if (!config.publicAddress?.trim()) {
    warnings.push("publicAddress is empty — internet players may not find or connect to this server");
  }
  warnings.push(...validateBattleyeConfig(instance.id));
  const missing = checkConfiguredMods(instance).filter((mod) => !mod.ok && mod.modId);
  if (missing.length) {
    warnings.push(`${missing.length} configured mod(s) not found on disk — download mods or start once to cache them`);
  }
  return warnings;
}

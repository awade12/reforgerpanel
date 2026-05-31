import { buildRegistrationDiagnostics } from "../lib/shared/network-ports";
import type { PreflightReport } from "../lib/shared/preflight";
import type { InstanceRecord } from "../lib/shared/types";
import { HttpError } from "../lib/shared/http-error";
import { preflightSummary } from "../lib/shared/preflight";
import { queryInstanceA2s } from "./a2s";
import { validateBattleyeConfig } from "./battleye";
import { readInstanceConfig } from "./instances";
import { checkConfiguredMods } from "./mods";
import { runInstancePreflight } from "./preflight-host";

export type InstanceDiagnostics = {
  preflight: PreflightReport;
  registration: ReturnType<typeof buildRegistrationDiagnostics>;
  battleyeWarnings: string[];
  modChecks: ReturnType<typeof checkConfiguredMods>;
  a2s: Awaited<ReturnType<typeof queryInstanceA2s>> | null;
};

export async function getInstanceDiagnostics(instance: InstanceRecord): Promise<InstanceDiagnostics> {
  const config = readInstanceConfig(instance);
  const preflight = await runInstancePreflight(instance, config);
  let a2s = null;
  if (instance.status === "running") {
    a2s = await queryInstanceA2s(instance);
  }
  const registration = buildRegistrationDiagnostics(config, a2s?.listed ?? null);
  return {
    preflight,
    registration,
    battleyeWarnings: validateBattleyeConfig(instance.id),
    modChecks: checkConfiguredMods(instance),
    a2s,
  };
}

export async function collectStartWarnings(instance: InstanceRecord) {
  const preflight = await runInstancePreflight(instance);
  return preflight.checks.filter((c) => c.severity === "warn").map((c) => `${c.label}: ${c.detail}`);
}

export async function assertPreflightForStart(instance: InstanceRecord, force = false) {
  const preflight = await runInstancePreflight(instance);
  if (!preflight.canStart && !force) {
    throw new HttpError(409, `Pre-flight failed — ${preflightSummary(preflight)}`, { preflight });
  }
  return preflight;
}

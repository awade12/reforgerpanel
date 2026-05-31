import type { InstanceStatus } from "./types";

export function isInstanceLive(status: InstanceStatus) {
  return status === "running" || status === "starting";
}

export function isInstanceBusy(status: InstanceStatus) {
  return status === "starting" || status === "stopping";
}

export function isInstanceLive(status: string) {
  return status === "running" || status === "starting";
}

export function isInstanceBusy(status: string) {
  return status === "starting" || status === "stopping";
}

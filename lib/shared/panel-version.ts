import packageJson from "../../package.json";

export function getPanelVersion() {
  return packageJson.version;
}

export function getRepositoryUrl() {
  return typeof packageJson.repository === "object" && packageJson.repository && "url" in packageJson.repository
    ? String(packageJson.repository.url).replace(/\.git$/, "")
    : "https://github.com/awade12/reforgerpanel";
}

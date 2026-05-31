export const PANEL_SESSION_SECRET =
  process.env.PANEL_SESSION_SECRET ??
  process.env.SESSION_SECRET ??
  process.env.AGENT_TOKEN ??
  "change-me-session-secret";

export const PANEL_SESSION_COOKIE = "reforgerpanel_session";

export function cookieSecureFlag() {
  return process.env.COOKIE_SECURE === "true";
}

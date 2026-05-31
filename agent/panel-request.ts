import type http from "http";

export const PANEL_CLIENT_HEADER = "x-reforger-panel";
export const PANEL_SESSION_HEADER = "x-panel-session";
export const PANEL_SESSION_COOKIE = "reforgerpanel_session";

export function isPanelClient(req: http.IncomingMessage) {
  return req.headers[PANEL_CLIENT_HEADER] === "1";
}

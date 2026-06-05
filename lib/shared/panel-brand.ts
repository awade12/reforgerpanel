export const PANEL_PRODUCT_NAME = "Reforger Host";

export const PANEL_NAME = PANEL_PRODUCT_NAME;
export const PANEL_NAME_SHORT = "Host";
export const PANEL_TAGLINE = "Dedicated server console";
export const PANEL_LOGIN_MONO = "reforger.host";

export function getPanelDisplayTitle(): string {
  const custom =
    typeof process !== "undefined" ? process.env.NEXT_PUBLIC_PANEL_TITLE?.trim() : undefined;
  return custom || PANEL_PRODUCT_NAME;
}

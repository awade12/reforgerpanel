export const APP_ID_STABLE = 1874900;
export const APP_ID_EXPERIMENTAL = 1890870;

export const REFORGER_ROOT = process.env.REFORGER_ROOT ?? "/opt/reforger";
export const SERVER_STABLE_DIR = `${REFORGER_ROOT}/server-stable`;
export const SERVER_EXP_DIR = `${REFORGER_ROOT}/server-exp`;
export const INSTANCES_DIR = `${REFORGER_ROOT}/instances`;
export const MISSIONS_DIR = `${REFORGER_ROOT}/missions`;
export const LOCAL_MODS_DIR = `${REFORGER_ROOT}/local-mods`;
export const STEAMCMD = process.env.STEAMCMD_PATH ?? "/opt/reforger/steamcmd/steamcmd.sh";

export const DEFAULT_GAME_PORT = 2001;
export const DEFAULT_A2S_PORT = 17777;
export const DEFAULT_RCON_PORT = 19999;
export const DEFAULT_MAX_FPS = 60;

export const AGENT_HOST = process.env.AGENT_HOST ?? "127.0.0.1";
export const AGENT_PORT = Number(process.env.AGENT_PORT ?? 9100);
export const PANEL_PUBLIC_URL = (process.env.PANEL_PUBLIC_URL ?? process.env.NEXT_PUBLIC_PANEL_URL ?? "").replace(/\/$/, "");

export const PLATFORMS = ["PLATFORM_PC", "PLATFORM_XBL", "PLATFORM_PSN"] as const;

export const OFFICIAL_SCENARIOS = [
  { id: "{ECC61978EDCC2B5A}Missions/23_Campaign.conf", name: "Conflict - Everon", source: "Arma Reforger" },
  { id: "{59AD59368755F41A}Missions/21_GM_Eden.conf", name: "Game Master - Everon", source: "Arma Reforger" },
  { id: "{002AF7323E0129AF}Missions/Tutorial.conf", name: "Training", source: "Arma Reforger" },
  { id: "{2BBBE828037C6F4B}Missions/22_GM_Arland.conf", name: "Game Master - Arland", source: "Arma Reforger" },
  { id: "{C700DB41F0C546E1}Missions/23_Campaign_NorthCentral.conf", name: "Conflict - Northern Everon", source: "Arma Reforger" },
  { id: "{28802845ADA64D52}Missions/23_Campaign_SWCoast.conf", name: "Conflict - Southern Everon", source: "Arma Reforger" },
  { id: "{DAA03C6E6099D50F}Missions/24_CombatOps.conf", name: "Combat Ops - Arland", source: "Arma Reforger" },
  { id: "{C41618FD18E9D714}Missions/23_Campaign_Arland.conf", name: "Conflict - Arland", source: "Arma Reforger" },
  { id: "{DFAC5FABD11F2390}Missions/26_CombatOpsEveron.conf", name: "Combat Ops - Everon", source: "Arma Reforger" },
] as const;

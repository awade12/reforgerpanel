import "../lib/shared/load-env";
import path from "path";
import {
  AGENT_HOST,
  AGENT_PORT,
  INSTANCES_DIR,
  MISSIONS_DIR,
  REFORGER_ROOT,
  SERVER_EXP_DIR,
  SERVER_STABLE_DIR,
} from "../lib/shared/constants";

export const agentConfig = {
  host: AGENT_HOST,
  port: AGENT_PORT,
  token: process.env.AGENT_TOKEN ?? "change-me-agent-token",
  adminPassword: process.env.ADMIN_PASSWORD ?? "admin",
  dataDir: process.env.PANEL_DATA_DIR ?? path.join(process.cwd(), "data"),
  reforgerRoot: REFORGER_ROOT,
  instancesDir: INSTANCES_DIR,
  missionsDir: MISSIONS_DIR,
  serverStableDir: SERVER_STABLE_DIR,
  serverExpDir: SERVER_EXP_DIR,
  steamcmd: process.env.STEAMCMD_PATH ?? "/opt/reforger/steamcmd/steamcmd.sh",
  steamHome: process.env.STEAM_HOME ?? "/opt/reforger/steam-home",
  runAsUser: process.env.REFORGER_USER ?? process.env.USER ?? "ubuntu",
};

export const dbPath = path.join(agentConfig.dataDir, "panel.db");

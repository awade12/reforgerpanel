import http from "http";
import { WebSocketServer } from "ws";
import { agentConfig } from "./config";
import { initDb } from "./db";
import { ensureReforgerDirs } from "./steamcmd";
import { getInstanceDetailed } from "./instances";
import { loadMissionMetaFromDisk } from "./missions";
import { ensureScenarioCache } from "./scenarios";
import { findLatestLogFile, parseFpsFromLogs, startMonitorLoop, tailLogFile } from "./logs";
import { startMetricsCollector } from "./metrics-collector";
import { startScheduledUpdateLoop } from "./monitor";
import { startScheduledRestartLoop } from "./maintenance";
import { startMissionRotationLoop } from "./mission-rotation";
import { clearPanelUpdateRunningFlag, startPanelUpdateLoop } from "./panel-update";
import { handleRequest } from "./router";
import { agentTokenOk } from "./panel-auth";

export function startAgent() {
  void initDb()
    .then(() => {
      startAgentServer();
    })
    .catch((err) => {
      console.error("[agent] Database init failed:", err instanceof Error ? err.message : err);
      process.exit(1);
    });
}

function startAgentServer() {
  ensureReforgerDirs();
  ensureScenarioCache("stable");
  ensureScenarioCache("experimental");
  loadMissionMetaFromDisk();

  const server = http.createServer((req, res) => {
    void handleRequest(req, res);
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    if (!req.url?.startsWith("/ws/logs/")) {
      socket.destroy();
      return;
    }
    if (!agentTokenOk(req)) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const id = req.url!.split("/").pop()!;
      const item = getInstanceDetailed(id);
      if (!item) {
        ws.close(4404, "Instance not found");
        return;
      }

      ws.send(JSON.stringify({ type: "meta", fps: parseFpsFromLogs(item.profilePath) }));
      let offset = 0;
      let closed = false;
      const timer = setInterval(() => {
        if (closed || ws.readyState !== ws.OPEN) return;
        const current = getInstanceDetailed(id);
        if (!current) return;
        const latest = findLatestLogFile(current.profilePath);
        if (!latest) return;
        try {
          const tail = tailLogFile(latest, offset);
          offset = tail.nextByte;
          if (tail.content) ws.send(tail.content);
          const fps = parseFpsFromLogs(current.profilePath);
          ws.send(JSON.stringify({ type: "meta", fps }));
        } catch {
          /* log read race */
        }
      }, 1000);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
      };
      ws.on("close", cleanup);
      ws.on("error", cleanup);
    });
  });

  startMonitorLoop();
  startMetricsCollector();
  startScheduledUpdateLoop();
  startScheduledRestartLoop();
  startMissionRotationLoop();
  startPanelUpdateLoop();
  clearPanelUpdateRunningFlag();

  server.listen(agentConfig.port, agentConfig.host, () => {
    console.log(`Reforger agent listening on http://${agentConfig.host}:${agentConfig.port}`);
  });
}

if (require.main === module) {
  startAgent();
}

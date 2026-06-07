import { updateInstance } from "../db";
import {
  createInstance,
  cloneInstance,
  getInstanceDetailed,
  getInstanceStatus,
  listInstancesDetailed,
  removeInstanceById,
  restartInstanceById,
  startInstanceById,
  stopInstanceById,
  updateInstanceSettings,
} from "../instances";
import { mergeMissionModsIntoInstance } from "../missions";
import { appendBattleyeSettings, deleteBattleyeConfig, readBattleyeConfig, validateBattleyeConfig } from "../battleye";
import { sendTestAlert, syncInstanceStatusEmbed } from "../alerts";
import { resolveStatusWebhookUrl } from "../discord";
import { queryInstanceA2s } from "../a2s";
import { berconCommandForInstance, berconPlayersForInstance } from "../bercon";
import { queryInstancePlayers } from "../players";
import { getInstanceDiagnostics } from "../diagnostics";
import { applyUfwRules } from "../firewall";
import { checkConfiguredMods, missingRequiredMods } from "../mods";
import { refreshWorkshopMods } from "../workshop";
import { installOrUpdate } from "../steamcmd";
import { findLatestLogFile, listLogFiles, parseFpsFromLogs, tailLogFile, tailLogLines } from "../logs";
import {
  createInstanceBackup,
  deleteInstanceBackup,
  listInstanceBackups,
  restoreInstanceBackup,
} from "../backup";
import {
  buildRotationStatus,
  runMissionRotation,
  updateInstanceRotation,
} from "../mission-rotation";
import { createInstanceFromTemplate, saveInstanceTemplate } from "../templates";
import {
  mergeBattleyePassword,
  redactBattleyeForPanel,
  redactInstanceForPanel,
} from "../../lib/shared/secrets";
import { isPanelClient } from "../panel-request";
import { parseBranch, sendJson, type RequestContext } from "../http";
import { respondInstance, respondInstanceAction } from "./helpers";

export async function handleInstanceRoutes(ctx: RequestContext): Promise<boolean> {
  const { pathname, method } = ctx;

  if (pathname === "/instances" && method === "GET") {
    const items = listInstancesDetailed();
    sendJson(
      ctx.res,
      200,
      isPanelClient(ctx.req) ? items.map((item) => redactInstanceForPanel(item)) : items,
    );
    return true;
  }
  
      if (pathname === "/instances" && method === "POST") {
        const body = await ctx.readBody();
        if (body.templateSlug) {
          const created = createInstanceFromTemplate(String(body.templateSlug), {
            name: String(body.name ?? "Reforger Server").trim() || "Reforger Server",
            publicPort: body.publicPort != null && body.publicPort !== "" ? Number(body.publicPort) : undefined,
            publicAddress: body.publicAddress ? String(body.publicAddress) : undefined,
          });
          sendJson(ctx.res, 201, isPanelClient(ctx.req) ? redactInstanceForPanel(created) : created);
          return true;
        }
        const created = createInstance({
          name: String(body.name ?? "Reforger Server").trim() || "Reforger Server",
          branch: parseBranch(body.branch),
          scenarioId: String(body.scenarioId ?? "{ECC61978EDCC2B5A}Missions/23_Campaign.conf"),
          publicPort: body.publicPort != null && body.publicPort !== "" ? Number(body.publicPort) : undefined,
          publicAddress: body.publicAddress ? String(body.publicAddress) : undefined,
          maxPlayers: body.maxPlayers ? Number(body.maxPlayers) : undefined,
          crossPlatform: Boolean(body.crossPlatform),
          mods: body.mods as never,
        });
        sendJson(ctx.res, 201, isPanelClient(ctx.req) ? redactInstanceForPanel(created) : created);
        return true;
      }
  
      const instanceMatch = pathname.match(/^\/instances\/([^/]+)(\/.*)?$/);
      if (instanceMatch) {
        const id = instanceMatch[1];
        const sub = instanceMatch[2] ?? "";
  
        if (sub === "" && method === "GET") {
          respondInstance(ctx.res, ctx.req, getInstanceDetailed(id));
          return true;
        }
  
        if (sub === "" && method === "PATCH") {
          const body = await ctx.readBody();
          const updated = updateInstanceSettings(id, body as never);
          respondInstance(ctx.res, ctx.req, updated);
          return true;
        }
  
        if (sub === "" && method === "PUT") {
          const body = await ctx.readBody();
          const updated = updateInstanceSettings(id, body as never);
          respondInstance(ctx.res, ctx.req, updated);
          return true;
        }
  
        if (sub === "" && method === "DELETE") {
          removeInstanceById(id);
          sendJson(ctx.res, 200, { ok: true });
          return true;
        }
  
        if (sub === "/start" && method === "POST") {
          const body = await ctx.readBody().catch(() => ({}));
          const result = await startInstanceById(id, { force: body.force === true });
          respondInstanceAction(ctx.res, ctx.req, result);
          return true;
        }
  
        if (sub === "/stop" && method === "POST") {
          const result = await stopInstanceById(id);
          respondInstanceAction(ctx.res, ctx.req, result);
          return true;
        }
  
        if (sub === "/restart" && method === "POST") {
          const result = await restartInstanceById(id);
          respondInstanceAction(ctx.res, ctx.req, result);
          return true;
        }
  
        if (sub === "/status" && method === "GET") {
          const status = getInstanceStatus(id);
          if (!status) sendJson(ctx.res, 404, { error: "Not found" });
          sendJson(ctx.res, 200, status);
          return true;
        }
  
        if (sub === "/logs/stream" && method === "GET") {
          const item = getInstanceDetailed(id);
          if (!item) sendJson(ctx.res, 404, { error: "Not found" });
          ctx.res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          });
          let offset = 0;
          let closed = false;
          const timer = setInterval(() => {
            if (closed) return;
            const current = getInstanceDetailed(id);
            if (!current) return;
            const latest = findLatestLogFile(current.profilePath);
            if (!latest) return;
            try {
              const tail = tailLogFile(latest, offset);
              offset = tail.nextByte;
              const fps = parseFpsFromLogs(current.profilePath);
              const payload = JSON.stringify({ content: tail.content, nextByte: tail.nextByte, fps, latest });
              ctx.res.write(`data: ${payload}\n\n`);
            } catch {
              /* ignore */
            }
          }, 1000);
          ctx.req.on("close", () => {
            closed = true;
            clearInterval(timer);
          });
          return true;
        }
  
        if (sub === "/logs" && method === "GET") {
          const item = getInstanceDetailed(id);
          if (!item) sendJson(ctx.res, 404, { error: "Not found" });
          const files = listLogFiles(item.profilePath);
          const latest = findLatestLogFile(item.profilePath);
          const lineCount = Number(ctx.url.searchParams.get("lines") ?? 0);
          if (lineCount > 0) {
            const capped = Math.min(Math.max(lineCount, 1), 50);
            const content = latest ? tailLogLines(latest, capped) : "";
            const fps = parseFpsFromLogs(item.profilePath);
            sendJson(ctx.res, 200, { files, latest, content, lines: capped, fps });
            return true;
          }
          const from = Number(ctx.url.searchParams.get("from") ?? 0);
          const tail = latest ? tailLogFile(latest, from) : { content: "", nextByte: 0 };
          const fps = parseFpsFromLogs(item.profilePath);
          sendJson(ctx.res, 200, { files, latest, ...tail, fps });
          return true;
        }
  
        if (sub === "/bot-status" && method === "PATCH") {
          const body = await ctx.readBody();
          const messageId = body.messageId == null || body.messageId === "" ? null : String(body.messageId);
          const updated = updateInstance(id, { discordBotStatusMessageId: messageId });
          if (!updated) sendJson(ctx.res, 404, { error: "Not found" });
          sendJson(ctx.res, 200, { ok: true, discordBotStatusMessageId: messageId });
          return true;
        }
  
        if (sub === "/a2s" && method === "GET") {
          const item = getInstanceDetailed(id);
          if (!item) sendJson(ctx.res, 404, { error: "Not found" });
          sendJson(ctx.res, 200, await queryInstanceA2s(item));
          return true;
        }
  
        if (sub === "/preflight" && method === "GET") {
          const item = getInstanceDetailed(id);
          if (!item) sendJson(ctx.res, 404, { error: "Not found" });
          const { runInstancePreflight } = await import("../preflight-host");
          sendJson(ctx.res, 200, await runInstancePreflight(item, item.config));
          return true;
        }

        if (sub === "/diagnostics" && method === "GET") {
          const item = getInstanceDetailed(id);
          if (!item) sendJson(ctx.res, 404, { error: "Not found" });
          sendJson(ctx.res, 200, await getInstanceDiagnostics(item));
          return true;
        }
  
        if (sub === "/firewall" && method === "POST") {
          const item = getInstanceDetailed(id);
          if (!item) sendJson(ctx.res, 404, { error: "Not found" });
          const result = applyUfwRules(item.config, item.slug);
          sendJson(ctx.res, 200, result);
          return true;
        }
  
        if (sub === "/mods/check" && method === "GET") {
          const item = getInstanceDetailed(id);
          if (!item) sendJson(ctx.res, 404, { error: "Not found" });
          sendJson(ctx.res, 200, { mods: checkConfiguredMods(item), missing: missingRequiredMods(item).length });
          return true;
        }
  
        if (sub === "/mods/download" && method === "POST") {
          const item = getInstanceDetailed(id);
          if (!item) sendJson(ctx.res, 404, { error: "Not found" });
          const mods = (item.config.game.mods ?? []).filter((mod) => mod.modId?.trim());
          if (!mods.length) {
            sendJson(ctx.res, 400, { error: "No mods configured" });
            return true;
          }
          const result = refreshWorkshopMods(item.profilePath, mods);
          const shouldRestart = item.status === "running" || item.status === "starting";
          if (shouldRestart) {
            await restartInstanceById(id);
          }
          sendJson(ctx.res, 200, { ...result, restarted: shouldRestart });
          return true;
        }
  
        if (sub === "/bercon/players" && method === "GET") {
          const item = getInstanceDetailed(id);
          if (!item) sendJson(ctx.res, 404, { error: "Not found" });
          try {
            const result = await berconPlayersForInstance(id);
            sendJson(ctx.res, 200, result);
            return true;
          } catch (err) {
            sendJson(ctx.res, 502, { error: err instanceof Error ? err.message : String(err) });
            return true;
          }
        }
  
        if (sub === "/players" && method === "GET") {
          const item = getInstanceDetailed(id);
          if (!item) sendJson(ctx.res, 404, { error: "Not found" });
          try {
            const result = await queryInstancePlayers(id);
            sendJson(ctx.res, 200, result);
            return true;
          } catch (err) {
            sendJson(ctx.res, 502, { error: err instanceof Error ? err.message : String(err) });
            return true;
          }
        }
  
        if (sub === "/bercon/command" && method === "POST") {
          const item = getInstanceDetailed(id);
          if (!item) sendJson(ctx.res, 404, { error: "Not found" });
          const body = await ctx.readBody();
          const command = String(body.command ?? "").trim();
          if (!command) sendJson(ctx.res, 400, { error: "command is required" });
          try {
            const result = await berconCommandForInstance(id, command);
            sendJson(ctx.res, 200, result);
            return true;
          } catch (err) {
            sendJson(ctx.res, 502, { error: err instanceof Error ? err.message : String(err) });
            return true;
          }
        }
  
        if (sub === "/battleye" && method === "GET") {
          const config = readBattleyeConfig(id);
          const payload = {
            ...config,
            warnings: validateBattleyeConfig(id),
          };
          sendJson(ctx.res, 200, isPanelClient(ctx.req) ? { ...redactBattleyeForPanel(config), warnings: payload.warnings } : payload);
          return true;
        }
  
        if (sub === "/battleye" && method === "POST") {
          const body = await ctx.readBody();
          const current = readBattleyeConfig(id);
          const password = mergeBattleyePassword(
            current.rconPassword,
            body.rconPassword === undefined ? undefined : String(body.rconPassword),
          );
          const updated = appendBattleyeSettings(id, Number(body.rconPort ?? current.rconPort ?? 5678), password);
          sendJson(ctx.res, 200, isPanelClient(ctx.req) ? redactBattleyeForPanel(updated) : updated);
          return true;
        }
  
        if (sub === "/battleye/repair" && method === "POST") {
          deleteBattleyeConfig(id);
          const item = getInstanceDetailed(id);
          const branch = item?.branch ?? "stable";
          const result = await installOrUpdate(branch);
          sendJson(ctx.res, 200, result);
          return true;
        }
  
        if (sub === "/merge-mission" && method === "POST") {
          const body = await ctx.readBody();
          mergeMissionModsIntoInstance(id, String(body.missionSlug), Boolean(body.replace));
          respondInstance(ctx.res, ctx.req, getInstanceDetailed(id));
          return true;
        }
  
    if (sub === "/clone" && method === "POST") {
      const body = await ctx.readBody();
      const cloned = cloneInstance(id, {
        name: String(body.name ?? "").trim() || "Cloned server",
        publicPort: body.publicPort != null && body.publicPort !== "" ? Number(body.publicPort) : undefined,
        includeProfile: body.includeProfile !== false,
      });
      sendJson(ctx.res, 201, isPanelClient(ctx.req) ? redactInstanceForPanel(cloned) : cloned);
      return true;
    }

    if (sub === "/backups" && method === "GET") {
      sendJson(ctx.res, 200, { backups: listInstanceBackups(id) });
      return true;
    }

    if (sub === "/backups" && method === "POST") {
      const body = await ctx.readBody().catch(() => ({}));
      const backup = createInstanceBackup(id, {
        label: body.label ? String(body.label) : undefined,
        includeLogs: body.includeLogs === true,
      });
      sendJson(ctx.res, 201, backup);
      return true;
    }

    const backupMatch = sub.match(/^\/backups\/([^/]+)(\/restore)?$/);
    if (backupMatch) {
      const backupId = backupMatch[1];
      if (backupMatch[2] === "/restore" && method === "POST") {
        const backups = await restoreInstanceBackup(id, backupId);
        sendJson(ctx.res, 200, { ok: true, backups });
        return true;
      }
      if (method === "DELETE") {
        deleteInstanceBackup(id, backupId);
        sendJson(ctx.res, 200, { ok: true });
        return true;
      }
    }

    if (sub === "/template" && method === "POST") {
      const body = await ctx.readBody();
      const meta = saveInstanceTemplate(id, {
        title: String(body.title ?? "").trim(),
        description: body.description ? String(body.description) : undefined,
        slug: body.slug ? String(body.slug) : undefined,
      });
      sendJson(ctx.res, 201, meta);
      return true;
    }

    if (sub === "/rotation" && method === "GET") {
      sendJson(ctx.res, 200, buildRotationStatus(id));
      return true;
    }

    if (sub === "/rotation" && method === "PATCH") {
      const body = await ctx.readBody();
      sendJson(ctx.res, 200, updateInstanceRotation(id, body as never));
      return true;
    }

    if (sub === "/rotation/run" && method === "POST") {
      const body = await ctx.readBody().catch(() => ({}));
      const status = await runMissionRotation(id, {
        trigger: "manual",
        force: body.force === true,
      });
      sendJson(ctx.res, 200, status);
      return true;
    }

    if (sub === "/alerts/test" && method === "POST") {
      const item = getInstanceDetailed(id);
      if (!item) {
        sendJson(ctx.res, 404, { error: "Not found" });
        return true;
      }
      await sendTestAlert(id);
      sendJson(ctx.res, 200, { ok: true });
      return true;
    }

    if (sub === "/alerts/sync-status" && method === "POST") {
      const item = getInstanceDetailed(id);
      if (!item) {
        sendJson(ctx.res, 404, { error: "Not found" });
        return true;
      }
      if (!item.alerts?.statusEmbedEnabled) {
        sendJson(ctx.res, 400, { error: "Enable Discord status embed under Settings → Alerts first." });
        return true;
      }
      if (!resolveStatusWebhookUrl(item)) {
        sendJson(ctx.res, 400, {
          error: "No Discord status webhook configured. Set one under Settings → Alerts or enable the global webhook.",
        });
        return true;
      }
      await syncInstanceStatusEmbed(id, true);
      sendJson(ctx.res, 200, getInstanceDetailed(id));
      return true;
    }
  }

  return false;
}

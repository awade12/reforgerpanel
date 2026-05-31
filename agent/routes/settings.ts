import { getSettings, listAudit, saveSettings } from "../db";
import { mergeSettingsSecrets, redactSettingsForPanel } from "../../lib/shared/secrets";
import { sendResendTestEmail } from "../email";
import { isPanelClient } from "../panel-request";
import { sendJson, type RequestContext } from "../http";

export async function handleSettingsRoutes(ctx: RequestContext) {
  const { pathname, method, res, req } = ctx;

  if (pathname === "/audit" && method === "GET") {
    sendJson(res, 200, listAudit());
    return true;
  }

  if (pathname === "/settings" && method === "GET") {
    const settings = getSettings();
    sendJson(res, 200, isPanelClient(req) ? redactSettingsForPanel(settings) : settings);
    return true;
  }

  if (pathname === "/settings" && method === "PATCH") {
    const body = await ctx.readBody();
    const current = getSettings();
    saveSettings(mergeSettingsSecrets(current, body as never));
    const settings = getSettings();
    sendJson(res, 200, isPanelClient(req) ? redactSettingsForPanel(settings) : settings);
    return true;
  }

  if (pathname === "/settings/resend-test" && method === "POST") {
    const body = await ctx.readBody();
    const to = String(body.to ?? "").trim();
    const result = await sendResendTestEmail(getSettings(), to);
    sendJson(res, 200, { ok: true, ...result });
    return true;
  }

  if (pathname === "/settings/discord-test" && method === "POST") {
    const { notifyDiscordPlain } = await import("../discord");
    const webhook = getSettings().discordWebhookUrl.trim();
    if (!webhook) return sendJson(res, 400, { error: "Discord webhook URL not configured" });
    const result = await notifyDiscordPlain("Reforger Panel", "Global webhook test — alerts are working.", webhook);
    if (!result.ok) return sendJson(res, 502, { error: result.error });
    sendJson(res, 200, { ok: true });
    return true;
  }

  if (pathname === "/settings/discord-bot-status" && method === "GET") {
    const { getDiscordBotStatus } = await import("../bot-runtime");
    sendJson(res, 200, getDiscordBotStatus());
    return true;
  }

  if (pathname === "/settings/discord-bot-test" && method === "POST") {
    const { resolveDiscordBotConfig, verifyDiscordBotToken } = await import("../../lib/shared/discord-bot-settings");
    const resolved = resolveDiscordBotConfig(getSettings());
    if (!resolved?.token) return sendJson(res, 400, { error: "Bot token not configured" });
    try {
      const bot = await verifyDiscordBotToken(resolved.token);
      if (resolved.clientId && bot.id !== resolved.clientId) {
        return sendJson(res, 400, {
          error: `Token belongs to application ${bot.id}, but client ID is set to ${resolved.clientId}`,
        });
      }
      return sendJson(res, 200, { ok: true, username: bot.username, id: bot.id });
    } catch (err) {
      return sendJson(res, 502, {
        error: err instanceof Error ? err.message : "Discord bot token verification failed",
      });
    }
  }

  return false;
}

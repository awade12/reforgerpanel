import { PANEL_NAME } from "../lib/shared/panel-brand";
import type { InstanceRecord } from "../lib/shared/types";
import { getSettings } from "./db";

export type WebhookResult = { ok: true; id?: string } | { ok: false; error: string };

export function parseWebhookUrl(webhookUrl: string): { id: string; token: string } | null {
  const match = webhookUrl.trim().match(/webhooks\/(\d+)\/([^/?#]+)/);
  if (!match) return null;
  return { id: match[1], token: match[2] };
}

export async function postWebhookMessage(
  webhookUrl: string,
  body: Record<string, unknown>,
  wait = true,
): Promise<WebhookResult> {
  const trimmed = webhookUrl.trim();
  if (!trimmed) return { ok: false, error: "Webhook URL is empty" };
  if (!parseWebhookUrl(trimmed)) {
    return {
      ok: false,
      error: "Invalid webhook URL — use the full https://discord.com/api/webhooks/… link from Discord",
    };
  }

  const base = trimmed.split("?")[0];
  const url = wait ? `${base}?wait=true` : base;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = (await res.text()).trim().slice(0, 200);
      return {
        ok: false,
        error: detail ? `Discord ${res.status}: ${detail}` : `Discord returned HTTP ${res.status}`,
      };
    }
    if (!wait) return { ok: true };
    try {
      const data = (await res.json()) as { id?: string };
      return data.id ? { ok: true, id: data.id } : { ok: true };
    } catch {
      return { ok: true };
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to reach Discord" };
  }
}

export async function patchWebhookMessage(
  webhookUrl: string,
  messageId: string,
  body: Record<string, unknown>,
): Promise<WebhookResult> {
  const parsed = parseWebhookUrl(webhookUrl);
  if (!parsed) return { ok: false, error: "Invalid webhook URL" };
  try {
    const res = await fetch(`https://discord.com/api/webhooks/${parsed.id}/${parsed.token}/messages/${messageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = (await res.text()).trim().slice(0, 200);
      return { ok: false, error: detail ? `Discord ${res.status}: ${detail}` : `Discord returned HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to reach Discord" };
  }
}

export async function deleteWebhookMessage(webhookUrl: string, messageId: string): Promise<WebhookResult> {
  const parsed = parseWebhookUrl(webhookUrl);
  if (!parsed) return { ok: false, error: "Invalid webhook URL" };
  try {
    const res = await fetch(`https://discord.com/api/webhooks/${parsed.id}/${parsed.token}/messages/${messageId}`, {
      method: "DELETE",
    });
    if (!res.ok && res.status !== 404) {
      return { ok: false, error: `Discord returned HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to reach Discord" };
  }
}

export async function notifyDiscordPlain(
  title: string,
  message: string,
  webhookUrl: string,
): Promise<WebhookResult> {
  if (!webhookUrl.trim()) return { ok: false, error: "Webhook URL is empty" };
  return postWebhookMessage(webhookUrl, { content: `**${title}**\n${message}` }, false);
}

export async function notifyDiscordLegacy(
  event: string,
  instance: InstanceRecord,
  message: string,
  webhookUrl: string,
  extra?: Record<string, unknown>,
): Promise<WebhookResult> {
  if (!webhookUrl.trim()) return { ok: false, error: "Webhook URL is empty" };
  const settings = getSettings();
  const pingEvents = new Set(["crashed", "crash-loop"]);
  const mention =
    settings.discordAlertRoleId.trim() && pingEvents.has(event)
      ? `<@&${settings.discordAlertRoleId.trim()}> `
      : "";
  const body = {
    content: mention || undefined,
    embeds: [
      {
        title: `${PANEL_NAME} — ${event}`,
        description: message,
        color: event.includes("crash") ? 0xff4444 : event.includes("recovery") ? 0x66cc88 : 0x9966ff,
        fields: [
          { name: "Instance", value: instance.name, inline: true },
          { name: "Slug", value: instance.slug, inline: true },
          { name: "Branch", value: instance.branch, inline: true },
          ...(extra
            ? Object.entries(extra).map(([name, value]) => ({
                name,
                value: String(value),
                inline: true,
              }))
            : []),
        ],
        timestamp: new Date().toISOString(),
      },
    ],
  };
  return postWebhookMessage(webhookUrl, body, false);
}

export function resolveStatusWebhookUrl(instance: InstanceRecord) {
  const settings = getSettings();
  const dedicated = settings.discordStatusWebhookUrl.trim();
  if (dedicated) return dedicated;
  const override = instance.alerts?.discordWebhookUrl?.trim();
  if (override) return override;
  return settings.discordWebhookUrl.trim();
}

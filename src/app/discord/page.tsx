"use client";

import { useEffect, useState } from "react";
import { Shell, Card, Button, Input, api, ApiError } from "@/components/Shell";
import { DiscordBotStatusPanel } from "@/components/discord-bot-status";
import { defaultSettings, normalizePanelSettings } from "@/lib/shared/alerts";
import { normalizePanelSettingsResponse, type PanelSettingsResponse } from "@/lib/shared/secrets";

type Settings = PanelSettingsResponse;

const initialSettings = defaultSettings() as Settings;

export default function DiscordPage() {
  const [settings, setSettings] = useState<Settings>(initialSettings);
  const [message, setMessage] = useState("");
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [testingBot, setTestingBot] = useState(false);

  async function load() {
    const loaded = await api<Partial<Settings>>("settings");
    setSettings(normalizePanelSettingsResponse(loaded));
  }

  useEffect(() => {
    void load();
  }, []);

  function patch(partial: Partial<Settings>) {
    setSettings((prev) => ({ ...prev, ...partial }));
  }

  async function save() {
    await api("settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    setMessage("Discord settings saved");
  }

  async function testWebhook() {
    setTestingWebhook(true);
    setMessage("");
    try {
      await api("settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      await api("settings/discord-test", { method: "POST" });
      setMessage("Test message sent to Discord");
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Webhook test failed — check the URL");
    } finally {
      setTestingWebhook(false);
    }
  }

  async function testBot() {
    setTestingBot(true);
    setMessage("");
    try {
      await api("settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const result = await api<{ username: string; id: string }>("settings/discord-bot-test", { method: "POST" });
      setMessage(`Bot token valid — ${result.username} (${result.id}). Restart the bot to apply credential changes.`);
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Bot token test failed");
    } finally {
      setTestingBot(false);
    }
  }

  return (
    <Shell header={{ title: "Discord", meta: "Bot, webhooks, and live status" }}>
      {message && <p className="mb-4 text-emerald-400">{message}</p>}

      <div className="mb-6">
        <DiscordBotStatusPanel clientId={settings.discordBotClientId} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Bot">
          <div className="grid gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.discordBotEnabled}
                onChange={(e) => patch({ discordBotEnabled: e.target.checked })}
              />
              Enable Discord bot
            </label>
            <Input
              label="Bot token"
              type="password"
              value={settings.discordBotToken}
              onChange={(v) => patch({ discordBotToken: v })}
              placeholder="Developer Portal → Bot → Token"
            />
            <Input
              label="Application client ID"
              value={settings.discordBotClientId}
              onChange={(v) => patch({ discordBotClientId: v })}
              placeholder="Developer Portal → Application ID"
            />
            <Input
              label="Guild ID"
              value={settings.discordBotGuildId}
              onChange={(v) => patch({ discordBotGuildId: v })}
              placeholder="Right-click server → Copy Server ID"
            />
            <Input
              label="Admin role ID"
              value={settings.discordBotAdminRoleId}
              onChange={(v) => patch({ discordBotAdminRoleId: v })}
              placeholder="/start /stop /restart /logs — falls back to alert role"
            />
            <Input
              label="Live status channel ID"
              value={settings.discordBotStatusChannelId}
              onChange={(v) => patch({ discordBotStatusChannelId: v })}
              placeholder="#server-status — one embed per instance, updates every 60s"
            />
            <p className="text-xs text-muted-foreground">
              Run the bot with `npm run bot` or `reforgerpanel-bot.service`. Restart after changing token or client ID.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void save()}>Save</Button>
              <Button
                variant="ghost"
                disabled={
                  testingBot ||
                  (!settings.discordBotToken && !settings.hasDiscordBotToken) ||
                  !settings.discordBotClientId
                }
                onClick={() => void testBot()}
              >
                {testingBot ? "Checking…" : "Test token"}
              </Button>
            </div>
          </div>
        </Card>

        <Card title="Webhooks">
          <div className="grid gap-3">
            <Input
              label="Alerts webhook"
              value={settings.discordWebhookUrl}
              onChange={(v) => patch({ discordWebhookUrl: v })}
            />
            <Input
              label="Status webhook (optional)"
              value={settings.discordStatusWebhookUrl}
              onChange={(v) => patch({ discordStatusWebhookUrl: v })}
            />
            <Input
              label="Alert role ID"
              value={settings.discordAlertRoleId}
              onChange={(v) => patch({ discordAlertRoleId: v })}
            />
            <p className="text-xs text-muted-foreground">
              One-way alerts from the panel (crashes, start/stop, etc.). Per-instance status embeds can use the status
              webhook when set.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void save()}>Save</Button>
              <Button variant="ghost" disabled={testingWebhook || (!settings.discordWebhookUrl && !settings.hasDiscordWebhookUrl)} onClick={() => void testWebhook()}>
                {testingWebhook ? "Sending…" : "Test webhook"}
              </Button>
            </div>
          </div>
        </Card>

        <Card title="Live dashboard">
          <div className="grid gap-3">
            <p className="text-xs text-muted-foreground">
              The bot posts pinned maintenance banners, live instance embeds, crash role pings, and seed alerts in the
              status channel. No slash commands required.
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.discordBotMaintenanceEnabled}
                onChange={(e) => patch({ discordBotMaintenanceEnabled: e.target.checked })}
              />
              Show maintenance banner in status channel
            </label>
            <Input
              label="Maintenance message"
              value={settings.discordBotMaintenanceMessage}
              onChange={(v) => patch({ discordBotMaintenanceMessage: v })}
              placeholder="Scheduled maintenance 04:00 UTC — servers may restart"
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.discordBotSeedPingEnabled}
                onChange={(e) => patch({ discordBotSeedPingEnabled: e.target.checked })}
              />
              Ping seed role when a server is empty
            </label>
            <Input
              label="Seed role ID"
              value={settings.discordBotSeedRoleId}
              onChange={(v) => patch({ discordBotSeedRoleId: v })}
              placeholder="Role to ping when 0 players — @Seed"
            />
            <Input
              label="Empty minutes before seed ping"
              value={String(settings.discordBotSeedEmptyMinutes)}
              onChange={(v) => patch({ discordBotSeedEmptyMinutes: Math.max(1, Number(v) || 15) })}
              placeholder="15"
            />
            <p className="text-xs text-muted-foreground">
              Save here, then restart the bot. After a panel code update, restart the agent too (`npm run agent` or
              `reforgerpanel-agent.service`) so dashboard sync works.
            </p>
            <Button onClick={() => void save()}>Save</Button>
          </div>
        </Card>

        <Card title="Slash commands" className="lg:col-span-2">
          <div className="grid gap-4 text-sm text-muted-foreground sm:grid-cols-2">
            <div>
              <p className="mb-2 font-medium text-foreground">Everyone</p>
              <ul className="space-y-1 text-xs">
                <li>`/dashboard` — host overview</li>
                <li>`/instances` — list servers</li>
                <li>`/status` — instance detail</li>
                <li>`/host` — host metrics</li>
                <li>`/ping` — latency check</li>
              </ul>
            </div>
            <div>
              <p className="mb-2 font-medium text-foreground">Admin role</p>
              <ul className="space-y-1 text-xs">
                <li>`/logs` — tail console logs</li>
                <li>`/start` · `/stop` · `/restart`</li>
              </ul>
            </div>
          </div>
        </Card>
      </div>
    </Shell>
  );
}

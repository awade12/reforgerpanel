"use client";

import { useEffect, useState } from "react";
import type { PanelInstanceAlerts, PanelSettingsResponse } from "@/lib/shared/secrets";
import { normalizeInstanceAlertsResponse } from "@/lib/shared/secrets";
import type { InstanceDetail } from "@/hooks/use-instance";
import { Button, Input, api, ApiError } from "@/components/Shell";

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export function InstanceAlertsPanel({
  id,
  instance,
  onSaved,
  onError,
}: {
  id: string;
  instance: InstanceDetail;
  onSaved: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [alerts, setAlerts] = useState<PanelInstanceAlerts>(() => normalizeInstanceAlertsResponse(instance.alerts));
  const [globalWebhook, setGlobalWebhook] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    setAlerts(normalizeInstanceAlertsResponse(instance.alerts));
  }, [instance]);

  useEffect(() => {
    void api<PanelSettingsResponse>("settings")
      .then((s) => setGlobalWebhook(s.hasDiscordWebhookUrl ? "configured" : ""))
      .catch(() => undefined);
  }, []);

  const effectiveWebhook =
    alerts.hasDiscordWebhookUrl || alerts.discordWebhookUrl.trim() || globalWebhook;

  function patch(partial: Partial<PanelInstanceAlerts>) {
    setAlerts((prev) => ({ ...prev, ...partial }));
  }

  async function save() {
    onError("");
    setSaving(true);
    try {
      await api(`instances/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alerts }),
      });
      onSaved("Alert settings saved");
    } catch (err) {
      onError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function testAlert() {
    onError("");
    setTesting(true);
    try {
      await api(`instances/${id}/alerts/test`, { method: "POST" });
      onSaved("Test alert sent to Discord");
    } catch (err) {
      onError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Test failed");
    } finally {
      setTesting(false);
    }
  }

  async function syncStatus() {
    onError("");
    setSyncing(true);
    try {
      await api(`instances/${id}/alerts/sync-status`, { method: "POST" });
      onSaved("Status embed synced to Discord");
    } catch (err) {
      onError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <section className="mb-8 border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <p className="font-mono text-[11px] text-muted-foreground">Alerts</p>
        <h2 className="mt-0.5 text-sm font-medium text-foreground">Discord notifications</h2>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          Uses the global webhook from Settings unless you override it below. Enable the live status embed to post a
          message that updates every minute while the server is monitored.
        </p>
        {!effectiveWebhook && (
          <p className="mt-2 text-xs text-destructive">
            No webhook configured — add one in Settings → Alerts and click Save settings, then try again.
          </p>
        )}
      </div>

      <div className="space-y-4 p-4">
        <Input
          label="Webhook override (optional)"
          value={alerts.discordWebhookUrl}
          onChange={(v) => patch({ discordWebhookUrl: v })}
          placeholder="Leave empty to use global webhook"
        />

        <div className="grid gap-2 sm:grid-cols-2">
          <Toggle label="Alert on start" checked={alerts.alertOnStart} onChange={(v) => patch({ alertOnStart: v })} />
          <Toggle label="Alert on stop" checked={alerts.alertOnStop} onChange={(v) => patch({ alertOnStop: v })} />
          <Toggle label="Alert on restart" checked={alerts.alertOnRestart} onChange={(v) => patch({ alertOnRestart: v })} />
          <Toggle label="Alert on crash" checked={alerts.alertOnCrash} onChange={(v) => patch({ alertOnCrash: v })} />
          <Toggle
            label="Alert on auto-restart"
            checked={alerts.alertOnAutoRestart}
            onChange={(v) => patch({ alertOnAutoRestart: v })}
          />
          <Toggle
            label="Alert on crash loop"
            checked={alerts.alertOnCrashLoop}
            onChange={(v) => patch({ alertOnCrashLoop: v })}
          />
          <Toggle
            label="Alert on start warnings"
            checked={alerts.alertOnStartWarning}
            onChange={(v) => patch({ alertOnStartWarning: v })}
          />
          <Toggle
            label="Alert on FPS recovery"
            checked={alerts.alertOnFpsRecovery}
            onChange={(v) => patch({ alertOnFpsRecovery: v })}
          />
          <Toggle
            label="Alert on player join"
            checked={alerts.alertOnPlayerJoin}
            onChange={(v) => patch({ alertOnPlayerJoin: v })}
          />
          <Toggle
            label="Alert on player leave"
            checked={alerts.alertOnPlayerLeave}
            onChange={(v) => patch({ alertOnPlayerLeave: v })}
          />
          <Toggle
            label="Alert on high memory"
            checked={alerts.alertOnHighMemory}
            onChange={(v) => patch({ alertOnHighMemory: v })}
          />
        </div>

        <div className="border border-border p-3">
          <Toggle
            label="Low FPS alerts"
            checked={alerts.alertOnLowFps}
            onChange={(v) => patch({ alertOnLowFps: v })}
          />
          <div className="mt-3 max-w-xs">
            <Input
              label="FPS threshold"
              value={String(alerts.lowFpsThreshold)}
              onChange={(v) => patch({ lowFpsThreshold: Number(v) || 30 })}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Checked every 15s; alerts throttled to once per 15 minutes.</p>
        </div>

        <div className="border border-border p-3">
          <Toggle
            label="Live status embed in Discord"
            checked={alerts.statusEmbedEnabled}
            onChange={(v) => patch({ statusEmbedEnabled: v })}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Posts a live status banner in Discord when{" "}
            <code className="text-foreground">PANEL_PUBLIC_URL</code> is an{" "}
            <strong className="font-medium text-foreground">HTTPS</strong> URL Discord can reach (HTTP preview works in
            your browser, but Discord will not load HTTP images).
            {instance.discordStatusMessageId ? " A status message is linked for this instance." : ""}
          </p>
          <a
            href={`/api/instances/${id}/status.png`}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block text-xs text-primary underline-offset-2 hover:underline"
          >
            Preview status card
          </a>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-border px-4 py-4">
        <Button disabled={saving} onClick={() => void save()}>
          {saving ? "Saving…" : "Save alerts"}
        </Button>
        <Button variant="ghost" disabled={testing || !effectiveWebhook} onClick={() => void testAlert()}>
          {testing ? "Sending…" : "Send test alert"}
        </Button>
        <Button variant="ghost" disabled={syncing || !alerts.statusEmbedEnabled} onClick={() => void syncStatus()}>
          {syncing ? "Syncing…" : "Refresh status embed"}
        </Button>
      </div>
    </section>
  );
}

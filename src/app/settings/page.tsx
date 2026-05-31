"use client";

import { useEffect, useState } from "react";
import { Shell, Card, Button, Input, api } from "@/components/Shell";
import { defaultSettings, normalizePanelSettings } from "@/lib/shared/alerts";
import { normalizePanelSettingsResponse, type PanelSettingsResponse } from "@/lib/shared/secrets";
import type { SettingsRecord } from "@/lib/shared/types";

type Settings = PanelSettingsResponse;

const initialSettings = defaultSettings() as Settings;

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>(initialSettings);
  const [audit, setAudit] = useState<{ at: string; action: string; detail: string }[]>([]);
  const [message, setMessage] = useState("");

  async function load() {
    const loaded = await api<Partial<Settings>>("settings");
    setSettings(normalizePanelSettingsResponse(loaded));
    setAudit(await api("audit"));
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
    setMessage("Settings saved");
  }

  return (
    <Shell header={{ title: "Settings", meta: "Host automation and alerts" }}>
      {message && <p className="mb-4 text-emerald-400">{message}</p>}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Updates & alerts">
          <div className="grid gap-3">
            <Input
              label="Scheduled update cron (UTC)"
              value={settings.scheduledUpdateCron}
              onChange={(v) => patch({ scheduledUpdateCron: v })}
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.enableScheduledUpdates}
                onChange={(e) => patch({ enableScheduledUpdates: e.target.checked })}
              />
              Enable scheduled stable updates
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.enableModAwareUpdates}
                onChange={(e) => patch({ enableModAwareUpdates: e.target.checked })}
              />
              Stop instances before scheduled updates (mod-aware pipeline)
            </label>
            <Input
              label="Daily digest cron (UTC)"
              value={settings.dailyDigestCron}
              onChange={(v) => patch({ dailyDigestCron: v })}
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.enableDailyDigest}
                onChange={(e) => patch({ enableDailyDigest: e.target.checked })}
              />
              Send daily multi-instance digest
            </label>
            <Input
              label="Memory alert threshold (MB)"
              value={String(settings.memoryAlertThresholdMb)}
              onChange={(v) => patch({ memoryAlertThresholdMb: Number(v) || 4096 })}
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.enableMemoryAlerts}
                onChange={(e) => patch({ enableMemoryAlerts: e.target.checked })}
              />
              Enable global memory alerts (per-instance toggle still applies)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.enableFirewallAutomation}
                onChange={(e) => patch({ enableFirewallAutomation: e.target.checked })}
              />
              Auto-apply UFW rules when an instance starts
            </label>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void save()}>Save settings</Button>
            </div>
          </div>
        </Card>

        <Card title="Email (Resend)">
          <div className="grid gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.resendEnabled}
                onChange={(e) => patch({ resendEnabled: e.target.checked })}
              />
              Enable email delivery via Resend
            </label>
            <Input
              label="Resend API key"
              type="password"
              value={settings.resendApiKey}
              onChange={(v) => patch({ resendApiKey: v })}
            />
            <Input
              label="From email"
              value={settings.resendFromEmail}
              onChange={(v) => patch({ resendFromEmail: v })}
            />
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void save()}>Save email settings</Button>
            </div>
          </div>
        </Card>

        <Card title="Audit log">
          <div className="max-h-[420px] space-y-2 overflow-auto text-xs">
            {audit.map((entry) => (
              <div key={`${entry.at}-${entry.action}-${entry.detail}`} className="rounded border border-zinc-800 p-2">
                <p className="text-zinc-500">{entry.at}</p>
                <p>
                  {entry.action} · {entry.detail}
                </p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </Shell>
  );
}

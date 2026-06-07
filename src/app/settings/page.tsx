"use client";

import { useEffect, useRef, useState } from "react";
import { Shell, Card, Button, Input, LinkButton, api, ApiError } from "@/components/Shell";
import { defaultSettings } from "@/lib/shared/alerts";
import { normalizePanelSettingsResponse, type PanelSettingsResponse } from "@/lib/shared/secrets";

type Settings = PanelSettingsResponse;

type UpdateJob = {
  running: boolean;
  ok: boolean | null;
  error: string | null;
  finishedAt: string | null;
  nextScheduledAt: string | null;
  restartedInstances: string[];
};

type MaintenanceJob = UpdateJob & {
  backedUpInstances: string[];
};

const initialSettings = defaultSettings() as Settings;

type PanelUpdateStatus = {
  running: boolean;
  ok: boolean | null;
  error: string | null;
  finishedAt: string | null;
  currentCommit: string | null;
  behindCommits: number | null;
  branch: string | null;
  nextScheduledAt: string | null;
  phase: string | null;
  elapsedSec: number | null;
  logTail: string[];
  logFile: string;
};

function formatElapsed(sec: number | null | undefined) {
  if (sec == null) return "";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>(initialSettings);
  const [audit, setAudit] = useState<{ at: string; action: string; detail: string }[]>([]);
  const [message, setMessage] = useState("");
  const [updateJob, setUpdateJob] = useState<UpdateJob | null>(null);
  const [maintenanceJob, setMaintenanceJob] = useState<MaintenanceJob | null>(null);
  const [panelUpdate, setPanelUpdate] = useState<PanelUpdateStatus | null>(null);
  const updatePollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maintenancePollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const panelPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function loadPanelUpdate() {
    try {
      setPanelUpdate(await api<PanelUpdateStatus>("host/panel/update"));
    } catch {
      setPanelUpdate(null);
    }
  }

  async function loadUpdateJob() {
    try {
      setUpdateJob(await api<UpdateJob>("game/update"));
    } catch {
      setUpdateJob(null);
    }
  }

  async function loadMaintenanceJob() {
    try {
      setMaintenanceJob(await api<MaintenanceJob>("maintenance/restart"));
    } catch {
      setMaintenanceJob(null);
    }
  }

  async function load() {
    const loaded = await api<Partial<Settings>>("settings");
    setSettings(normalizePanelSettingsResponse(loaded));
    setAudit(await api("audit"));
    await loadUpdateJob();
    await loadMaintenanceJob();
    await loadPanelUpdate();
  }

  useEffect(() => {
    void load();
    return () => {
      if (updatePollRef.current) clearInterval(updatePollRef.current);
      if (maintenancePollRef.current) clearInterval(maintenancePollRef.current);
      if (panelPollRef.current) clearInterval(panelPollRef.current);
    };
  }, []);

  useEffect(() => {
    if (!panelUpdate?.running) return;
    if (panelPollRef.current) return;
    panelPollRef.current = setInterval(() => void loadPanelUpdate(), 3000);
    return () => {
      if (panelPollRef.current) {
        clearInterval(panelPollRef.current);
        panelPollRef.current = null;
      }
    };
  }, [panelUpdate?.running]);

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
    await loadUpdateJob();
  }

  async function runUpdateNow() {
    try {
      await api("game/update/run", { method: "POST" });
      if (updatePollRef.current) clearInterval(updatePollRef.current);
      updatePollRef.current = setInterval(() => void loadUpdateJob(), 2000);
      await loadUpdateJob();
      setMessage("Game update started");
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Failed to start update");
    }
  }

  async function runPanelUpdate() {
    try {
      await api("host/panel/update/run", { method: "POST" });
      if (panelPollRef.current) clearInterval(panelPollRef.current);
      panelPollRef.current = setInterval(() => void loadPanelUpdate(), 3000);
      await loadPanelUpdate();
      setMessage("Panel update started — page may reload when services restart");
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Failed to start panel update");
    }
  }

  async function runMaintenanceNow() {
    try {
      await api("maintenance/restart/run", { method: "POST" });
      if (maintenancePollRef.current) clearInterval(maintenancePollRef.current);
      maintenancePollRef.current = setInterval(() => void loadMaintenanceJob(), 2000);
      await loadMaintenanceJob();
      setMessage("Maintenance restart started");
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Failed to start maintenance restart");
    }
  }

  return (
    <Shell header={{ title: "Settings", meta: "Host automation and alerts" }}>
      {message && <p className="mb-4 text-emerald-400">{message}</p>}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Panel self-update">
          <div className="grid gap-3">
            <p className="text-sm text-zinc-400">
              Pulls latest code from git, runs npm ci + build, migrates DB, then restarts panel services. The UI will
              disconnect briefly during restart.
            </p>
            {panelUpdate?.currentCommit && (
              <p className="text-sm text-zinc-300">
                Current: {panelUpdate.branch} @ {panelUpdate.currentCommit}
                {panelUpdate.behindCommits != null && panelUpdate.behindCommits > 0
                  ? ` · ${panelUpdate.behindCommits} commit(s) behind origin`
                  : panelUpdate.behindCommits === 0
                    ? " · up to date"
                    : ""}
              </p>
            )}
            {panelUpdate?.running && (
              <div className="grid gap-2 rounded-lg border border-emerald-900/50 bg-emerald-950/20 p-3">
                <p className="text-sm text-emerald-400">
                  Panel update running
                  {panelUpdate.phase ? ` — ${panelUpdate.phase}` : "…"}
                  {panelUpdate.elapsedSec != null ? ` (${formatElapsed(panelUpdate.elapsedSec)})` : ""}
                </p>
                <p className="text-xs text-zinc-500">
                  npm ci + build often take 5–15 minutes on a VPS. The page may reload when services restart.
                </p>
                {panelUpdate.logTail.length > 0 && (
                  <pre className="max-h-40 overflow-auto rounded bg-zinc-950 p-2 text-xs text-zinc-400">
                    {panelUpdate.logTail.join("\n")}
                  </pre>
                )}
              </div>
            )}
            {panelUpdate?.ok === true && !panelUpdate.running && (
              <p className="text-sm text-emerald-400">
                {panelUpdate.finishedAt ? "Last panel update succeeded" : "Panel is up to date with origin"}
              </p>
            )}
            {panelUpdate?.ok === false && !panelUpdate.running && panelUpdate.error && (
              <div className="grid gap-2 rounded-lg border border-red-900/50 bg-red-950/20 p-3">
                <p className="text-sm text-red-400">{panelUpdate.error}</p>
                {panelUpdate.logTail.length > 0 && (
                  <pre className="max-h-48 overflow-auto rounded bg-zinc-950 p-2 text-xs text-zinc-400">
                    {panelUpdate.logTail.join("\n")}
                  </pre>
                )}
                <p className="text-xs text-zinc-500">
                  Full log: <span className="font-mono">{panelUpdate.logFile}</span>
                </p>
              </div>
            )}
            <Input
              label="Scheduled panel update cron (UTC)"
              value={settings.scheduledPanelUpdateCron}
              onChange={(v) => patch({ scheduledPanelUpdateCron: v })}
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.enableScheduledPanelUpdates}
                onChange={(e) => patch({ enableScheduledPanelUpdates: e.target.checked })}
              />
              Enable scheduled panel updates
            </label>
            <div className="flex flex-wrap gap-2">
              <Button disabled={panelUpdate?.running ?? false} onClick={() => void runPanelUpdate()}>
                Update panel now
              </Button>
              <Button onClick={() => void save()}>Save schedule</Button>
            </div>
          </div>
        </Card>

        <Card title="Game auto updater">
          <div className="grid gap-3">
            <p className="text-sm text-zinc-400">
              Daily SteamCMD validate for stable. Stops instances, updates server files, refreshes workshop mod cache,
              then restarts what was running. Cron is UTC.
            </p>
            {updateJob?.nextScheduledAt && settings.enableScheduledUpdates && (
              <p className="text-sm text-zinc-400">
                Next run: {new Date(updateJob.nextScheduledAt).toLocaleString()} (local)
              </p>
            )}
            {updateJob?.running && <p className="text-sm text-emerald-400">Update running…</p>}
            {updateJob?.ok === true && !updateJob.running && updateJob.finishedAt && (
              <p className="text-sm text-emerald-400">
                Last update succeeded
                {updateJob.restartedInstances.length ? ` · restarted ${updateJob.restartedInstances.join(", ")}` : ""}
              </p>
            )}
            {updateJob?.ok === false && !updateJob.running && updateJob.error && (
              <p className="text-sm text-red-400">{updateJob.error}</p>
            )}
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
              Enable scheduled updates
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.enableModAwareUpdates}
                onChange={(e) => patch({ enableModAwareUpdates: e.target.checked })}
              />
              Refresh workshop mods and restart instances after update
            </label>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void save()}>Save schedule</Button>
              <Button disabled={updateJob?.running ?? false} variant="ghost" onClick={() => void runUpdateNow()}>
                Run update now
              </Button>
              <LinkButton href="/game" variant="ghost">
                Game page
              </LinkButton>
            </div>
          </div>
        </Card>

        <Card title="Scheduled restarts">
          <div className="grid gap-3">
            <p className="text-sm text-zinc-400">
              Restarts instances on a schedule. Can show the Discord maintenance banner, auto-backup first, and notify
              your webhook. Cron is UTC.
            </p>
            {maintenanceJob?.nextScheduledAt && settings.enableScheduledRestarts && (
              <p className="text-sm text-zinc-400">
                Next run: {new Date(maintenanceJob.nextScheduledAt).toLocaleString()} (local)
              </p>
            )}
            {maintenanceJob?.running && <p className="text-sm text-emerald-400">Maintenance restart running…</p>}
            {maintenanceJob?.ok === true && !maintenanceJob.running && maintenanceJob.finishedAt && (
              <p className="text-sm text-emerald-400">
                Last run succeeded
                {maintenanceJob.restartedInstances.length
                  ? ` · restarted ${maintenanceJob.restartedInstances.join(", ")}`
                  : ""}
                {maintenanceJob.backedUpInstances?.length
                  ? ` · backup ${maintenanceJob.backedUpInstances.join(", ")}`
                  : ""}
              </p>
            )}
            {maintenanceJob?.ok === false && !maintenanceJob.running && maintenanceJob.error && (
              <p className="text-sm text-red-400">{maintenanceJob.error}</p>
            )}
            <Input
              label="Restart cron (UTC)"
              value={settings.scheduledRestartCron}
              onChange={(v) => patch({ scheduledRestartCron: v })}
            />
            <label className="block space-y-2 text-sm">
              <span className="font-mono text-[11px] uppercase text-muted-foreground">Restart scope</span>
              <select
                className="w-full border border-input bg-background px-3 py-2 text-sm"
                value={settings.scheduledRestartScope}
                onChange={(e) => patch({ scheduledRestartScope: e.target.value as "all" | "running" })}
              >
                <option value="running">Running instances only</option>
                <option value="all">All instances</option>
              </select>
            </label>
            <Input
              label="Maintenance message (optional)"
              value={settings.maintenanceRestartMessage}
              onChange={(v) => patch({ maintenanceRestartMessage: v })}
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.enableScheduledRestarts}
                onChange={(e) => patch({ enableScheduledRestarts: e.target.checked })}
              />
              Enable scheduled restarts
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.enableMaintenanceBeforeRestart}
                onChange={(e) => patch({ enableMaintenanceBeforeRestart: e.target.checked })}
              />
              Show Discord maintenance banner during restart
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.autoBackupBeforeRestart}
                onChange={(e) => patch({ autoBackupBeforeRestart: e.target.checked })}
              />
              Auto-backup before restart
            </label>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void save()}>Save schedule</Button>
              <Button disabled={maintenanceJob?.running ?? false} variant="ghost" onClick={() => void runMaintenanceNow()}>
                Run restart now
              </Button>
            </div>
          </div>
        </Card>

        <Card title="Updates & alerts">
          <div className="grid gap-3">
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

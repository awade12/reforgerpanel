"use client";

import { useEffect, useState } from "react";
import type { ModEntry, ServerConfig } from "@/lib/shared/config-schema";
import type { InstanceDetail } from "@/hooks/use-instance";
import { Button, api, ApiError } from "@/components/Shell";

interface Mission {
  slug: string;
  title: string;
}

type ModCheck = {
  modId: string;
  name?: string;
  ok: boolean;
  detail: string;
};

export function InstanceModsPanel({
  id,
  config,
  missions,
  onConfigChange,
  onApplied,
  onError,
}: {
  id: string;
  config: ServerConfig;
  missions: Mission[];
  onConfigChange: (config: ServerConfig) => void;
  onApplied: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [selectedMission, setSelectedMission] = useState("");
  const [replaceMods, setReplaceMods] = useState(false);
  const [applying, setApplying] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [checks, setChecks] = useState<ModCheck[]>([]);
  const mods = config.game.mods ?? [];

  function updateMod(index: number, patch: Partial<ModEntry>) {
    const next = mods.map((mod, i) => (i === index ? { ...mod, ...patch } : mod));
    onConfigChange({ ...config, game: { ...config.game, mods: next } });
  }

  function addMod() {
    onConfigChange({
      ...config,
      game: { ...config.game, mods: [...mods, { modId: "", name: "", workshopId: "", required: true }] },
    });
  }

  function removeMod(index: number) {
    onConfigChange({
      ...config,
      game: { ...config.game, mods: mods.filter((_, i) => i !== index) },
    });
  }

  async function refreshChecks() {
    try {
      const data = await api<{ mods: ModCheck[] }>(`instances/${id}/mods/check`);
      setChecks(data.mods);
    } catch {
      setChecks([]);
    }
  }

  useEffect(() => {
    void refreshChecks();
  }, [id, mods.length]);

  async function applyMission() {
    if (!selectedMission) return;
    onError("");
    setApplying(true);
    try {
      const updated = await api<InstanceDetail>(`instances/${id}/merge-mission`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ missionSlug: selectedMission, replace: replaceMods }),
      });
      onConfigChange(updated.config);
      onApplied(`Mission "${selectedMission}" applied`);
      await refreshChecks();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Apply failed");
    } finally {
      setApplying(false);
    }
  }

  async function downloadMods() {
    onError("");
    setDownloading(true);
    try {
      const result = await api<{
        results: { modId: string; ok: boolean; name?: string; detail: string }[];
        restarted: boolean;
      }>(`instances/${id}/mods/download`, { method: "POST" });
      const okCount = result.results.filter((item) => item.ok).length;
      const suffix = result.restarted
        ? " — instance restarted to download latest versions"
        : " — start the instance to download latest versions";
      onApplied(`Refreshed ${okCount}/${result.results.length} mod(s)${suffix}`);
      await refreshChecks();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Refresh failed");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <section className="mb-8 border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <p className="font-mono text-[11px] text-muted-foreground">Mods</p>
        <h2 className="mt-0.5 text-sm font-medium text-foreground">Workshop mods</h2>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          Mod IDs are Reforger workshop GUIDs. Refresh clears cached files so the server downloads the latest version on
          start.
        </p>
      </div>

      <div className="space-y-3 p-4">
        {mods.length === 0 && <p className="text-xs text-muted-foreground">No mods configured.</p>}
        {mods.map((mod, index) => {
          const check = checks.find((item) => item.modId === mod.modId);
          return (
            <div key={index} className="grid gap-2 border border-border p-3 lg:grid-cols-[1fr_1fr_10rem_auto_auto] lg:items-end">
              <label className="block space-y-1 text-xs">
                <span className="text-muted-foreground">Mod ID</span>
                <input
                  className="w-full border border-input bg-background px-2 py-1.5 font-mono text-xs"
                  value={mod.modId}
                  onChange={(e) => updateMod(index, { modId: e.target.value })}
                />
              </label>
              <label className="block space-y-1 text-xs">
                <span className="text-muted-foreground">Name</span>
                <input
                  className="w-full border border-input bg-background px-2 py-1.5 text-xs"
                  value={mod.name ?? ""}
                  onChange={(e) => updateMod(index, { name: e.target.value })}
                />
              </label>
              <label className="block space-y-1 text-xs">
                <span className="text-muted-foreground">Workshop ID (legacy)</span>
                <input
                  className="w-full border border-input bg-background px-2 py-1.5 font-mono text-xs"
                  value={mod.workshopId ?? ""}
                  onChange={(e) => updateMod(index, { workshopId: e.target.value })}
                  placeholder="optional"
                />
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={mod.required ?? false}
                  onChange={(e) => updateMod(index, { required: e.target.checked })}
                />
                Required
              </label>
              <button
                type="button"
                className="border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => removeMod(index)}
              >
                Remove
              </button>
              {check && (
                <p className={`text-[11px] lg:col-span-5 ${check.ok ? "text-chart-1" : "text-[#d4a574]"}`}>
                  {check.ok ? "Found on disk" : check.detail}
                </p>
              )}
            </div>
          );
        })}
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={addMod}>
            Add mod
          </Button>
          <Button variant="ghost" disabled={downloading} onClick={() => void downloadMods()}>
            {downloading ? "Refreshing…" : "Refresh workshop mods"}
          </Button>
          <Button variant="ghost" onClick={() => void refreshChecks()}>
            Check mods on disk
          </Button>
        </div>
      </div>

      {missions.length > 0 && (
        <div className="space-y-3 border-t border-border p-4">
          <p className="text-xs text-muted-foreground">Apply a registered mission (scenario + required mods).</p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="block min-w-[12rem] flex-1 space-y-1 text-sm">
              <span className="text-muted-foreground">Mission</span>
              <select
                className="w-full border border-input bg-background px-3 py-2 text-sm"
                value={selectedMission}
                onChange={(e) => setSelectedMission(e.target.value)}
              >
                <option value="">Select…</option>
                {missions.map((m) => (
                  <option key={m.slug} value={m.slug}>
                    {m.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={replaceMods} onChange={(e) => setReplaceMods(e.target.checked)} />
              Replace mod list
            </label>
            <Button disabled={!selectedMission || applying} onClick={() => void applyMission()}>
              {applying ? "Applying…" : "Apply mission"}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

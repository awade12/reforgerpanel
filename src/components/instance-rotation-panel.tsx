"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { InstanceRotationConfig, InstanceRotationStatus } from "@/lib/shared/types";
import { Button, Input, api, ApiError } from "@/components/Shell";

type MissionOption = {
  slug: string;
  title: string;
};

export function InstanceRotationPanel({
  id,
  onMessage,
  onError,
}: {
  id: string;
  onMessage: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [status, setStatus] = useState<InstanceRotationStatus | null>(null);
  const [missions, setMissions] = useState<MissionOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<InstanceRotationConfig | null>(null);
  const [selectedMission, setSelectedMission] = useState("");

  const load = useCallback(async () => {
    const [rotation, missionList] = await Promise.all([
      api<InstanceRotationStatus>(`instances/${id}/rotation`),
      api<MissionOption[]>("missions"),
    ]);
    setStatus(rotation);
    setDraft(rotation.rotation);
    setMissions(missionList);
  }, [id]);

  useEffect(() => {
    void load().catch(() => undefined);
  }, [load]);

  const availableMissions = useMemo(() => {
    if (!draft) return missions;
    return missions.filter((mission) => !draft.missionSlugs.includes(mission.slug));
  }, [draft, missions]);

  function patchRotation(partial: Partial<InstanceRotationConfig>) {
    setDraft((current) => (current ? { ...current, ...partial } : current));
  }

  function addMission() {
    if (!draft || !selectedMission) return;
    if (draft.missionSlugs.includes(selectedMission)) return;
    patchRotation({ missionSlugs: [...draft.missionSlugs, selectedMission] });
    setSelectedMission("");
  }

  function removeMission(slug: string) {
    if (!draft) return;
    patchRotation({ missionSlugs: draft.missionSlugs.filter((item) => item !== slug) });
  }

  function moveMission(slug: string, direction: -1 | 1) {
    if (!draft) return;
    const index = draft.missionSlugs.indexOf(slug);
    if (index < 0) return;
    const next = [...draft.missionSlugs];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    patchRotation({ missionSlugs: next });
  }

  async function save() {
    if (!draft) return;
    onError("");
    setBusy(true);
    try {
      const updated = await api<InstanceRotationStatus>(`instances/${id}/rotation`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      setStatus(updated);
      setDraft(updated.rotation);
      onMessage("Rotation schedule saved");
    } catch (err) {
      onError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function rotateNow(force = false) {
    onError("");
    setBusy(true);
    try {
      const updated = await api<InstanceRotationStatus>(`instances/${id}/rotation/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });
      setStatus(updated);
      setDraft(updated.rotation);
      onMessage(force ? "Mission rotated" : "Mission rotation started");
    } catch (err) {
      onError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Rotation failed");
    } finally {
      setBusy(false);
    }
  }

  if (!draft || !status) {
    return <p className="text-sm text-muted-foreground">Loading rotation…</p>;
  }

  return (
    <section className="mb-8 border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <p className="font-mono text-[11px] text-muted-foreground">Rotation</p>
        <h2 className="mt-0.5 text-sm font-medium text-foreground">Mission rotation</h2>
        <p className="mt-2 text-xs text-muted-foreground">
          Automatically switch missions on a schedule. Uses your mission library — add missions under Missions first.
        </p>
      </div>

      <div className="space-y-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="border border-border px-3 py-3">
            <p className="font-mono text-[10px] uppercase text-muted-foreground">Now</p>
            <p className="mt-1 text-sm text-foreground">{status.currentMissionTitle ?? "Unknown / custom"}</p>
          </div>
          <div className="border border-border px-3 py-3">
            <p className="font-mono text-[10px] uppercase text-muted-foreground">Next</p>
            <p className="mt-1 text-sm text-foreground">{status.nextMissionTitle ?? "—"}</p>
            {status.nextScheduledAt && draft.enabled && (
              <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                {new Date(status.nextScheduledAt).toLocaleString()}
              </p>
            )}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(e) => patchRotation({ enabled: e.target.checked })}
          />
          Enable mission rotation
        </label>

        <Input label="Cron (UTC)" value={draft.cron} onChange={(v) => patchRotation({ cron: v })} />

        <div className="space-y-2">
          <p className="font-mono text-[10px] uppercase text-muted-foreground">Rotation order</p>
          {draft.missionSlugs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Add at least two missions below.</p>
          ) : (
            <div className="divide-y divide-border border border-border">
              {draft.missionSlugs.map((slug, index) => {
                const mission = missions.find((item) => item.slug === slug);
                return (
                  <div key={slug} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <div>
                      <p className="text-sm text-foreground">
                        {index + 1}. {mission?.title ?? slug}
                      </p>
                      <p className="font-mono text-[10px] text-muted-foreground">{slug}</p>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" onClick={() => moveMission(slug, -1)}>
                        Up
                      </Button>
                      <Button variant="ghost" onClick={() => moveMission(slug, 1)}>
                        Down
                      </Button>
                      <Button variant="ghost" onClick={() => removeMission(slug)}>
                        Remove
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-[12rem] flex-1 space-y-2 text-sm">
              <span className="font-mono text-[10px] uppercase text-muted-foreground">Add mission</span>
              <select
                className="w-full border border-input bg-background px-3 py-2 text-sm"
                value={selectedMission}
                onChange={(e) => setSelectedMission(e.target.value)}
              >
                <option value="">Select…</option>
                {availableMissions.map((mission) => (
                  <option key={mission.slug} value={mission.slug}>
                    {mission.title}
                  </option>
                ))}
              </select>
            </label>
            <Button variant="ghost" disabled={!selectedMission} onClick={addMission}>
              Add
            </Button>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.onlyIfEmpty}
              onChange={(e) => patchRotation({ onlyIfEmpty: e.target.checked })}
            />
            Only rotate when empty
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.replaceMods}
              onChange={(e) => patchRotation({ replaceMods: e.target.checked })}
            />
            Replace mod list from mission
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.downloadMods}
              onChange={(e) => patchRotation({ downloadMods: e.target.checked })}
            />
            Download workshop mods before start
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.autoBackup}
              onChange={(e) => patchRotation({ autoBackup: e.target.checked })}
            />
            Backup before rotate
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.enableMaintenanceBanner}
              onChange={(e) => patchRotation({ enableMaintenanceBanner: e.target.checked })}
            />
            Discord maintenance banner
          </label>
        </div>

        <Input
          label="Maintenance message (optional, use {mission})"
          value={draft.maintenanceMessage}
          onChange={(v) => patchRotation({ maintenanceMessage: v })}
        />

        {status.rotation.lastRotatedAt && (
          <p className="font-mono text-[10px] text-muted-foreground">
            Last rotated {new Date(status.rotation.lastRotatedAt).toLocaleString()}
            {status.rotation.lastMissionSlug ? ` · ${status.rotation.lastMissionSlug}` : ""}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => void save()}>
            Save rotation
          </Button>
          <Button disabled={busy || !draft.enabled || draft.missionSlugs.length < 2} variant="ghost" onClick={() => void rotateNow(false)}>
            Rotate now
          </Button>
          <Button disabled={busy || draft.missionSlugs.length < 2} variant="ghost" onClick={() => void rotateNow(true)}>
            Force rotate
          </Button>
        </div>
      </div>
    </section>
  );
}

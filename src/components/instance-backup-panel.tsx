"use client";

import { useCallback, useEffect, useState } from "react";
import type { InstanceBackupMeta } from "@/lib/shared/types";
import { Button, api, ApiError } from "@/components/Shell";

export function InstanceBackupPanel({
  id,
  onMessage,
  onError,
}: {
  id: string;
  onMessage: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [backups, setBackups] = useState<InstanceBackupMeta[]>([]);
  const [label, setLabel] = useState("");
  const [includeLogs, setIncludeLogs] = useState(false);
  const [busy, setBusy] = useState(false);
  const [restoreId, setRestoreId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<{ backups: InstanceBackupMeta[] }>(`instances/${id}/backups`);
      setBackups(data.backups);
    } catch {
      /* optional */
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createBackup() {
    onError("");
    setBusy(true);
    try {
      await api(`instances/${id}/backups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim() || undefined, includeLogs }),
      });
      setLabel("");
      onMessage("Backup created");
      await load();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Backup failed");
    } finally {
      setBusy(false);
    }
  }

  async function restore(backupId: string) {
    onError("");
    setBusy(true);
    try {
      await api(`instances/${id}/backups/${encodeURIComponent(backupId)}/restore`, { method: "POST" });
      setRestoreId(null);
      onMessage("Backup restored — review settings and restart if needed");
      await load();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Restore failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(backupId: string) {
    onError("");
    setBusy(true);
    try {
      await api(`instances/${id}/backups/${encodeURIComponent(backupId)}`, { method: "DELETE" });
      onMessage("Backup deleted");
      await load();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mb-8 border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <p className="font-mono text-[11px] text-muted-foreground">Backup</p>
        <h2 className="mt-0.5 text-sm font-medium text-foreground">Backup &amp; restore</h2>
        <p className="mt-2 text-xs text-muted-foreground">
          Saves config, profile, and BattlEye files. Restore stops the instance first.
        </p>
      </div>

      <div className="space-y-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[12rem] flex-1 space-y-2 text-sm">
            <span className="font-mono text-[10px] uppercase text-muted-foreground">Label (optional)</span>
            <input
              className="w-full border border-input bg-background px-3 py-2 text-sm"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Before mission change"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={includeLogs} onChange={(e) => setIncludeLogs(e.target.checked)} />
            Include logs
          </label>
          <Button disabled={busy} onClick={() => void createBackup()}>
            {busy ? "Working…" : "Create backup"}
          </Button>
        </div>

        {backups.length === 0 ? (
          <p className="text-sm text-muted-foreground">No backups yet.</p>
        ) : (
          <div className="divide-y divide-border border border-border">
            {backups.map((backup) => (
              <div key={backup.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm text-foreground">
                    {backup.label || "Backup"} · {backup.sizeLabel}
                  </p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {new Date(backup.createdAt).toLocaleString()}
                    {backup.includesLogs ? " · with logs" : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {restoreId === backup.id ? (
                    <>
                      <Button disabled={busy} onClick={() => void restore(backup.id)}>
                        Confirm restore
                      </Button>
                      <Button variant="ghost" onClick={() => setRestoreId(null)}>
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button variant="ghost" onClick={() => setRestoreId(backup.id)}>
                        Restore
                      </Button>
                      <Button variant="ghost" disabled={busy} onClick={() => void remove(backup.id)}>
                        Delete
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

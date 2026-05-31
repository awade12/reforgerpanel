"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Input, api, ApiError } from "@/components/Shell";

export function InstanceOpsPanel({
  id,
  panelName,
  onRenamed,
  onError,
}: {
  id: string;
  panelName: string;
  onRenamed: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(panelName);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  async function rename() {
    if (!name.trim()) return;
    onError("");
    setBusy(true);
    try {
      await api(`instances/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      onRenamed("Panel name updated");
    } catch (err) {
      onError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Rename failed");
    } finally {
      setBusy(false);
    }
  }

  async function deleteInstance() {
    onError("");
    setBusy(true);
    try {
      await api(`instances/${id}`, { method: "DELETE" });
      router.push("/");
    } catch (err) {
      onError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Delete failed");
      setBusy(false);
    }
  }

  return (
    <section className="mb-8 border border-destructive/20 bg-card">
      <div className="border-b border-border px-4 py-3">
        <p className="font-mono text-[11px] text-muted-foreground">Instance</p>
        <h2 className="mt-0.5 text-sm font-medium text-foreground">Panel name &amp; delete</h2>
        <p className="mt-2 text-xs text-muted-foreground">
          Panel name is for the dashboard only. Server browser name is under Configuration → Name.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-[14rem] flex-1">
          <Input label="Panel name" value={name} onChange={setName} />
        </div>
        <Button disabled={busy || name.trim() === panelName} onClick={() => void rename()}>
          Rename
        </Button>
      </div>
      <div className="border-t border-border px-4 py-4">
        {!confirmDelete ? (
          <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
            Delete instance…
          </Button>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-destructive">Permanently delete this instance and all its files?</p>
            <Button disabled={busy} onClick={() => void deleteInstance()}>
              {busy ? "Deleting…" : "Confirm delete"}
            </Button>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

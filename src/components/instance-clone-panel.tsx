"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Input, api, ApiError } from "@/components/Shell";

export function InstanceClonePanel({
  id,
  defaultName,
  onMessage,
  onError,
}: {
  id: string;
  defaultName: string;
  onMessage: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(`${defaultName} copy`);
  const [autoPort, setAutoPort] = useState(true);
  const [publicPort, setPublicPort] = useState("");
  const [includeProfile, setIncludeProfile] = useState(true);
  const [suggestedPort, setSuggestedPort] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<{ suggestedPort?: number }>("host")
      .then((host) => {
        if (host.suggestedPort) {
          setSuggestedPort(host.suggestedPort);
          setPublicPort(String(host.suggestedPort));
        }
      })
      .catch(() => undefined);
  }, []);

  async function clone() {
    onError("");
    setBusy(true);
    try {
      const port = Number(publicPort);
      if (!autoPort && (!Number.isFinite(port) || port < 1 || port > 65535)) {
        throw new Error("Enter a valid UDP port");
      }
      const created = await api<{ id: string }>(`instances/${id}/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          includeProfile,
          ...(autoPort ? {} : { publicPort: port }),
        }),
      });
      onMessage("Instance cloned");
      router.push(`/instances/${created.id}`);
    } catch (err) {
      onError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Clone failed");
      setBusy(false);
    }
  }

  async function saveTemplate() {
    onError("");
    setBusy(true);
    try {
      const meta = await api<{ slug: string; title: string }>(`instances/${id}/template`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: name.trim() || defaultName }),
      });
      onMessage(`Template saved as ${meta.slug}`);
    } catch (err) {
      onError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Template save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mb-8 border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <p className="font-mono text-[11px] text-muted-foreground">Clone</p>
        <h2 className="mt-0.5 text-sm font-medium text-foreground">Clone or save as template</h2>
        <p className="mt-2 text-xs text-muted-foreground">
          Clone copies config and profile to a new instance. Templates save config only for quick creates.
        </p>
      </div>

      <div className="space-y-4 p-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Input label="New instance name" value={name} onChange={setName} />
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={autoPort} onChange={(e) => setAutoPort(e.target.checked)} />
              Auto-assign port
            </label>
            {!autoPort && <Input label="Public port" value={publicPort} onChange={setPublicPort} />}
            {autoPort && suggestedPort && (
              <p className="text-xs text-muted-foreground">Will use UDP {suggestedPort}</p>
            )}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={includeProfile} onChange={(e) => setIncludeProfile(e.target.checked)} />
          Copy profile (mods, saves, BattlEye)
        </label>

        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => void clone()}>
            {busy ? "Working…" : "Clone instance"}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => void saveTemplate()}>
            Save as template
          </Button>
        </div>
      </div>
    </section>
  );
}

"use client";

import { useEffect, useState } from "react";
import type { InstanceDetail } from "@/hooks/use-instance";
import { Button, Input, api, ApiError } from "@/components/Shell";

const LOG_LEVELS = ["", "normal", "warning", "error"];

export function InstanceAdvancedPanel({
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
  const [maxFps, setMaxFps] = useState("60");
  const [logStatsMs, setLogStatsMs] = useState("5000");
  const [logLevel, setLogLevel] = useState("");
  const [autoRestart, setAutoRestart] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setMaxFps(String(instance.maxFps ?? 60));
    setLogStatsMs(instance.logStatsMs != null ? String(instance.logStatsMs) : "");
    setLogLevel(instance.logLevel ?? "");
    setAutoRestart(instance.autoRestart ?? true);
  }, [instance]);

  async function save() {
    onError("");
    setSaving(true);
    try {
      await api(`instances/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          maxFps: Number(maxFps) || 60,
          logStatsMs: logStatsMs.trim() ? Number(logStatsMs) : null,
          logLevel: logLevel || null,
          autoRestart,
        }),
      });
      onSaved("Launch settings saved — restart to apply");
    } catch (err) {
      onError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mb-8 border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <p className="font-mono text-[11px] text-muted-foreground">Launch</p>
        <h2 className="mt-0.5 text-sm font-medium text-foreground">Advanced / startup</h2>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          Passed as -maxFPS, -logStats, -logLevel on ArmaReforgerServer. Wiki recommends maxFPS 60–120.
        </p>
      </div>
      <div className="grid gap-4 p-4 sm:grid-cols-2">
        <Input label="Max FPS" value={maxFps} onChange={setMaxFps} />
        <Input
          label="Log stats interval (ms)"
          value={logStatsMs}
          onChange={setLogStatsMs}
          placeholder="5000 or empty to disable"
        />
        <label className="block space-y-1 text-sm sm:col-span-2">
          <span className="text-muted-foreground">Log level</span>
          <select
            className="w-full border border-input bg-background px-3 py-2 text-sm text-foreground outline-none"
            value={logLevel}
            onChange={(e) => setLogLevel(e.target.value)}
          >
            <option value="">Default</option>
            {LOG_LEVELS.filter(Boolean).map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" checked={autoRestart} onChange={(e) => setAutoRestart(e.target.checked)} />
          Auto-restart on crash
        </label>
      </div>
      <div className="border-t border-border px-4 py-4">
        <Button disabled={saving} onClick={() => void save()}>
          {saving ? "Saving…" : "Save launch settings"}
        </Button>
      </div>
    </section>
  );
}

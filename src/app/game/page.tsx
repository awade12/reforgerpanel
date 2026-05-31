"use client";

import { useEffect, useRef, useState } from "react";
import { Shell, Card, Button, api, ApiError } from "@/components/Shell";

interface InstallJob {
  running: boolean;
  branch: string | null;
  ok: boolean | null;
  lines: string[];
  error: string | null;
  finishedAt: string | null;
}

export default function GamePage() {
  const [status, setStatus] = useState<{ stable: { installed: boolean }; experimental: { installed: boolean } } | null>(null);
  const [job, setJob] = useState<InstallJob | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function loadStatus() {
    setStatus(await api("game/status"));
  }

  async function pollJob() {
    const state = await api<InstallJob>("game/install");
    setJob(state);
    if (!state.running) {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
      await loadStatus();
    }
  }

  useEffect(() => {
    void loadStatus();
    void pollJob();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function install(branch: "stable" | "experimental") {
    try {
      await api("game/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch }),
      });
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(() => void pollJob(), 2000);
      await pollJob();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Failed to start install";
      setJob({
        running: false,
        branch,
        ok: false,
        lines: [message],
        error: message,
        finishedAt: new Date().toISOString(),
      });
    }
  }

  const busy = job?.running ?? false;
  const lines = job?.lines ?? [];

  return (
    <Shell>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Game installation">
          <div className="space-y-3 text-sm">
            <p>Stable (1874900): {status?.stable.installed ? "installed" : "not installed"}</p>
            <p>Experimental (1890870): {status?.experimental.installed ? "installed" : "not installed"}</p>
            {busy && <p className="text-emerald-400">Install in progress — this can take 10–20 minutes. Keep this page open.</p>}
            {job?.ok === true && !busy && <p className="text-emerald-400">Install finished successfully.</p>}
            {job?.ok === false && !busy && job.error && <p className="text-red-400">{job.error}</p>}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => install("stable")}>
              Install / update stable
            </Button>
            <Button disabled={busy} variant="ghost" onClick={() => install("experimental")}>
              Install / update experimental
            </Button>
          </div>
        </Card>
        <Card title="SteamCMD output">
          <pre className="max-h-[480px] overflow-auto rounded-md bg-black/40 p-3 text-xs text-zinc-300">
            {lines.join("\n") || "Click install to see output"}
          </pre>
        </Card>
      </div>
    </Shell>
  );
}

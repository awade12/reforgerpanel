"use client";

import { useEffect, useRef, useState } from "react";
import { Shell, Card, Button, LinkButton, api, ApiError } from "@/components/Shell";

interface InstallJob {
  running: boolean;
  branch: string | null;
  ok: boolean | null;
  lines: string[];
  error: string | null;
  finishedAt: string | null;
}

interface UpdateJob {
  running: boolean;
  trigger: string | null;
  ok: boolean | null;
  lines: string[];
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  branches: string[];
  restartedInstances: string[];
  stoppedInstances: string[];
  nextScheduledAt: string | null;
}

export default function GamePage() {
  const [status, setStatus] = useState<{ stable: { installed: boolean }; experimental: { installed: boolean } } | null>(null);
  const [job, setJob] = useState<InstallJob | null>(null);
  const [updateJob, setUpdateJob] = useState<UpdateJob | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const updatePollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  async function pollUpdateJob() {
    const state = await api<UpdateJob>("game/update");
    setUpdateJob(state);
    if (!state.running) {
      if (updatePollRef.current) clearInterval(updatePollRef.current);
      updatePollRef.current = null;
      await loadStatus();
    }
  }

  useEffect(() => {
    void loadStatus();
    void pollJob();
    void pollUpdateJob();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (updatePollRef.current) clearInterval(updatePollRef.current);
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

  async function runAutoUpdate() {
    try {
      await api("game/update/run", { method: "POST" });
      if (updatePollRef.current) clearInterval(updatePollRef.current);
      updatePollRef.current = setInterval(() => void pollUpdateJob(), 2000);
      await pollUpdateJob();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Failed to start update";
      setUpdateJob({
        running: false,
        trigger: "manual",
        ok: false,
        lines: [message],
        error: message,
        startedAt: null,
        finishedAt: new Date().toISOString(),
        branches: [],
        restartedInstances: [],
        stoppedInstances: [],
        nextScheduledAt: null,
      });
    }
  }

  const installBusy = job?.running ?? false;
  const updateBusy = updateJob?.running ?? false;
  const busy = installBusy || updateBusy;
  const lines = updateBusy || updateJob?.lines.length ? updateJob?.lines ?? [] : job?.lines ?? [];

  return (
    <Shell header={{ title: "Game", meta: "Install and auto-update Arma Reforger server files" }}>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Auto updater">
          <div className="space-y-3 text-sm text-zinc-300">
            <p>
              Stops all instances, runs SteamCMD validate on stable (and experimental if any instance uses it),
              refreshes configured workshop mods, then restarts what was running.
            </p>
            {updateJob?.nextScheduledAt && (
              <p className="text-zinc-400">Next scheduled run (UTC): {new Date(updateJob.nextScheduledAt).toLocaleString()}</p>
            )}
            {updateBusy && <p className="text-emerald-400">Update in progress — keep this page open.</p>}
            {updateJob?.ok === true && !updateBusy && (
              <p className="text-emerald-400">
                Update finished
                {updateJob.restartedInstances.length ? ` · restarted ${updateJob.restartedInstances.join(", ")}` : ""}
              </p>
            )}
            {updateJob?.ok === false && !updateBusy && updateJob.error && <p className="text-red-400">{updateJob.error}</p>}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => void runAutoUpdate()}>
              Run update now
            </Button>
            <LinkButton href="/settings" variant="ghost">
              Schedule settings
            </LinkButton>
          </div>
        </Card>

        <Card title="Manual install">
          <div className="space-y-3 text-sm">
            <p>Stable (1874900): {status?.stable.installed ? "installed" : "not installed"}</p>
            <p>Experimental (1890870): {status?.experimental.installed ? "installed" : "not installed"}</p>
            {installBusy && <p className="text-emerald-400">Install in progress — this can take 10–20 minutes.</p>}
            {job?.ok === true && !installBusy && <p className="text-emerald-400">Install finished successfully.</p>}
            {job?.ok === false && !installBusy && job.error && <p className="text-red-400">{job.error}</p>}
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

        <Card title="SteamCMD output" className="lg:col-span-2">
          <pre className="max-h-[480px] overflow-auto rounded-md bg-black/40 p-3 text-xs text-zinc-300">
            {lines.join("\n") || "Run an update to see output"}
          </pre>
        </Card>
      </div>
    </Shell>
  );
}

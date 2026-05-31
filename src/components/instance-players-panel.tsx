"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ChevronRightIcon, CopyIcon, RefreshCwIcon, UsersIcon } from "lucide-react";
import type { RconPlayer } from "@/lib/shared/rcon";
import { Button, api, ApiError } from "@/components/Shell";
import { cn } from "@/lib/utils";

type PlayersSnapshot = {
  players: RconPlayer[];
  a2sMaxPlayers: number | null;
  serverName: string | null;
  joinAddress: string;
};

function playerInitial(name: string) {
  const trimmed = name.trim();
  return trimmed ? trimmed[0]?.toUpperCase() ?? "?" : "?";
}

function CopyChip({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="group inline-flex max-w-full items-center gap-2 border border-border bg-background px-2.5 py-1.5 font-mono text-[11px] text-foreground transition-colors hover:bg-secondary"
      title={`Copy ${label}`}
    >
      <span className="truncate">{value}</span>
      <CopyIcon className="size-3 shrink-0 text-muted-foreground group-hover:text-foreground" />
      {copied && <span className="shrink-0 text-[10px] text-chart-1">Copied</span>}
    </button>
  );
}

function PlayerRow({ player }: { player: RconPlayer }) {
  return (
    <div className="flex items-center gap-3 border border-border bg-background px-3 py-3">
      <div className="flex size-9 shrink-0 items-center justify-center border border-border bg-secondary text-sm font-semibold text-foreground">
        {playerInitial(player.name)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-medium text-foreground">{player.name}</p>
          <span className="font-mono text-[10px] text-muted-foreground">#{player.id}</span>
        </div>
        {player.guid ? (
          <div className="mt-1.5">
            <CopyChip value={player.guid} label="UID" />
          </div>
        ) : (
          <p className="mt-1 font-mono text-[10px] text-muted-foreground">No UID</p>
        )}
      </div>
    </div>
  );
}

function usePlayersSnapshot(id: string, status: string, pollMs = 15000) {
  const [snapshot, setSnapshot] = useState<PlayersSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (status !== "running") {
      setSnapshot(null);
      setError("");
      return;
    }
    setLoading(true);
    try {
      const data = await api<PlayersSnapshot>(`instances/${id}/players`);
      setSnapshot(data);
      setError("");
    } catch (err) {
      setSnapshot(null);
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Could not load players");
    } finally {
      setLoading(false);
    }
  }, [id, status]);

  useEffect(() => {
    void refresh();
    if (status !== "running") return;
    const timer = setInterval(() => void refresh(), pollMs);
    return () => clearInterval(timer);
  }, [pollMs, refresh, status]);

  return { snapshot, loading, error, refresh };
}

export function InstancePlayersSummary({
  id,
  status,
}: {
  id: string;
  status: string;
}) {
  const { snapshot, loading } = usePlayersSnapshot(id, status, 20000);

  if (status !== "running") return null;

  const count = snapshot?.players.length ?? 0;
  const names = snapshot?.players.slice(0, 2).map((p) => p.name).join(", ");

  return (
    <Link
      href={`/instances/${id}/players`}
      className="mb-8 flex items-center justify-between gap-3 border border-border bg-card px-4 py-2.5 text-sm transition-colors hover:bg-secondary/40"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="relative flex size-1.5 shrink-0">
          <span className="absolute inline-flex size-full animate-ping bg-chart-1/40" />
          <span className="relative inline-flex size-1.5 bg-chart-1" />
        </span>
        <span className="truncate text-foreground">
          <span className="font-medium tabular-nums">{loading && !snapshot ? "…" : count}</span>
          <span className="text-muted-foreground"> online</span>
          {names ? <span className="text-muted-foreground"> · {names}{count > 2 ? "…" : ""}</span> : null}
        </span>
      </div>
      <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
        Players
        <ChevronRightIcon className="size-3.5" />
      </span>
    </Link>
  );
}

export function InstancePlayersPanel({
  id,
  status,
  maxPlayers,
}: {
  id: string;
  status: string;
  maxPlayers: number;
}) {
  const { snapshot, loading, error, refresh } = usePlayersSnapshot(id, status);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  useEffect(() => {
    if (!loading && snapshot) setUpdatedAt(new Date());
  }, [loading, snapshot]);

  const players = snapshot?.players ?? [];
  const capacity = snapshot?.a2sMaxPlayers ?? maxPlayers;
  const fill = capacity > 0 ? Math.min(100, Math.round((players.length / capacity) * 100)) : 0;
  const isRunning = status === "running";

  return (
    <section className="border border-border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {isRunning && (
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping bg-chart-1/40" />
                <span className="relative inline-flex size-2 bg-chart-1" />
              </span>
            )}
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {isRunning ? "Live session" : "Offline"}
            </p>
          </div>
          <h1 className="mt-2 text-lg font-semibold tracking-tight text-foreground">
            {snapshot?.serverName ?? "Connected players"}
          </h1>
          {updatedAt && isRunning && (
            <p className="mt-1 text-[11px] text-muted-foreground">Last sync {updatedAt.toLocaleTimeString()}</p>
          )}
        </div>
        <Button variant="ghost" disabled={loading || !isRunning} className="gap-2" onClick={() => void refresh()}>
          <RefreshCwIcon className={cn("size-3.5", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {error && <p className="border-b border-border px-4 py-3 text-xs text-[#d4a574] sm:px-5">{error}</p>}

      {!isRunning ? (
        <div className="flex flex-col items-center gap-2 px-4 py-10 text-center sm:px-5">
          <UsersIcon className="size-8 text-muted-foreground/40" strokeWidth={1.25} />
          <p className="text-sm text-muted-foreground">Start the server to track players here.</p>
        </div>
      ) : (
        <div className="space-y-5 p-4 sm:p-5">
          <div className="grid gap-px border border-border bg-border sm:grid-cols-3">
            <div className="bg-card px-4 py-4">
              <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">Online</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-foreground">{players.length}</p>
            </div>
            <div className="bg-card px-4 py-4">
              <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">Capacity</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-foreground">
                {capacity > 0 ? capacity : "—"}
              </p>
            </div>
            <div className="bg-card px-4 py-4">
              <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">Join</p>
              <div className="mt-2">
                {snapshot?.joinAddress ? (
                  <CopyChip value={snapshot.joinAddress} label="join address" />
                ) : (
                  <p className="text-sm text-muted-foreground">—</p>
                )}
              </div>
            </div>
          </div>

          {capacity > 0 && (
            <div>
              <div className="mb-2 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Server fill</span>
                <span className="tabular-nums">
                  {players.length}/{capacity}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden bg-secondary">
                <div
                  className="h-full bg-chart-1 transition-all duration-500"
                  style={{ width: `${Math.max(fill, players.length > 0 ? 2 : 0)}%` }}
                />
              </div>
            </div>
          )}

          {players.length === 0 ? (
            <div className="border border-dashed border-border px-4 py-8 text-center">
              <p className="text-sm text-muted-foreground">Nobody in-game yet.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Players appear after they fully spawn — not during loading or deploy.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {players.length === 1 ? "1 player" : `${players.length} players`}
              </p>
              <div className="space-y-2">
                {players.map((player) => (
                  <PlayerRow key={player.id} player={player} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

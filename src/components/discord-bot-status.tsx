"use client";

import { useEffect, useState } from "react";
import { api } from "@/components/Shell";
import type { DiscordBotStatusResponse } from "@/lib/shared/types";

function formatWhen(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

export function DiscordBotStatusPanel({ clientId }: { clientId: string }) {
  const [status, setStatus] = useState<DiscordBotStatusResponse | null>(null);

  useEffect(() => {
    let active = true;

    async function poll() {
      try {
        const next = await api<DiscordBotStatusResponse>("settings/discord-bot-status");
        if (active) setStatus(next);
      } catch {
        if (active) setStatus(null);
      }
    }

    void poll();
    const timer = setInterval(() => void poll(), 10_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const connected = status?.connected ?? false;
  const inviteUrl = status?.inviteUrl ?? (clientId ? `https://discord.com/oauth2/authorize?client_id=${clientId}` : null);

  return (
    <div className="space-y-3 border border-border bg-background/40 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-block size-2 rounded-full ${connected ? "bg-emerald-400" : "bg-red-400"}`} />
        <span className="font-medium">{connected ? "Connected" : "Offline"}</span>
        {status?.tag ? <span className="text-muted-foreground">· {status.tag}</span> : null}
      </div>
      <dl className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
        <div>
          <dt className="uppercase tracking-wide">Last seen</dt>
          <dd className="text-foreground">{formatWhen(status?.lastSeenAt ?? null)}</dd>
        </div>
        <div>
          <dt className="uppercase tracking-wide">Commands deployed</dt>
          <dd className="text-foreground">{formatWhen(status?.lastDeployAt ?? null)}</dd>
        </div>
      </dl>
      {inviteUrl ? (
        <a
          href={inviteUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex text-xs text-sky-400 underline-offset-2 hover:underline"
        >
          Generate bot invite link
        </a>
      ) : (
        <p className="text-xs text-muted-foreground">Set application client ID to generate an invite link.</p>
      )}
    </div>
  );
}

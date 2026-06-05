"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ServerConfig } from "@/lib/shared/config-schema";
import type { InstanceAlertSettings } from "@/lib/shared/types";
import { normalizeInstanceAlertsResponse } from "@/lib/shared/secrets";
import { api, useShellHeader } from "@/components/Shell";
import { InstanceActionButtons } from "@/components/instance-action-buttons";
import { isInstanceBusy, isInstanceLive } from "@/lib/shared/instance-state";
import type { InstanceStatus } from "@/lib/shared/types";

export interface InstanceDetail {
  id: string;
  name: string;
  status: string;
  branch: string;
  slug: string;
  config: ServerConfig;
  autoRestart: boolean;
  maxFps: number;
  logStatsMs: number | null;
  logLevel: string | null;
  alerts: InstanceAlertSettings;
  discordStatusMessageId: string | null;
  runtime?: {
    uptimeSec?: number;
    memoryMb?: number;
    diskUsageMb?: number;
    systemdActive?: boolean;
  };
}

type ActionResponse = InstanceDetail | { instance: InstanceDetail; warnings?: string[]; preflight?: unknown };

function normalizeInstanceDetail(data: InstanceDetail): InstanceDetail {
  return {
    ...data,
    alerts: normalizeInstanceAlertsResponse(data.alerts),
    discordStatusMessageId: data.discordStatusMessageId ?? null,
    autoRestart: data.autoRestart ?? true,
    maxFps: data.maxFps ?? 60,
  };
}

function normalizeActionResponse(data: ActionResponse) {
  if (data && typeof data === "object" && "instance" in data) {
    return { instance: normalizeInstanceDetail(data.instance), warnings: data.warnings ?? [] };
  }
  return { instance: normalizeInstanceDetail(data as InstanceDetail), warnings: [] as string[] };
}

export function useInstance(id: string) {
  const [instance, setInstance] = useState<InstanceDetail | null>(null);
  const [error, setError] = useState("");
  const [pollStale, setPollStale] = useState(false);
  const [actionWarnings, setActionWarnings] = useState<string[]>([]);
  const reloadGeneration = useRef(0);
  const pollFailures = useRef(0);

  const reload = useCallback(async () => {
    const generation = ++reloadGeneration.current;
    const data = await api<InstanceDetail>(`instances/${id}`);
    if (generation !== reloadGeneration.current) return normalizeInstanceDetail(data);
    const normalized = normalizeInstanceDetail(data);
    setInstance(normalized);
    setError("");
    pollFailures.current = 0;
    setPollStale(false);
    return normalized;
  }, [id]);

  useEffect(() => {
    reloadGeneration.current += 1;
    setInstance(null);
    setPollStale(false);
    pollFailures.current = 0;
    void reload().catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, [id, reload]);

  useEffect(() => {
    const pollMs = instance && isInstanceBusy(instance.status) ? 3000 : 15000;
    const timer = setInterval(() => {
      void reload().catch(() => {
        pollFailures.current += 1;
        if (pollFailures.current >= 2) setPollStale(true);
      });
    }, pollMs);
    return () => clearInterval(timer);
  }, [instance?.status, reload]);

  const runAction = useCallback(
    async (kind: "start" | "stop" | "restart", options?: { force?: boolean }) => {
      const init: RequestInit = { method: "POST" };
      if (kind === "start" && options?.force) {
        init.headers = { "Content-Type": "application/json" };
        init.body = JSON.stringify({ force: true });
      }
      const data = await api<ActionResponse>(`instances/${id}/${kind}`, init);
      const { instance: next, warnings } = normalizeActionResponse(data);
      setInstance(next);
      pollFailures.current = 0;
      setPollStale(false);
      setActionWarnings(warnings);
      return warnings;
    },
    [id],
  );

  const clearActionWarnings = useCallback(() => setActionWarnings([]), []);

  return { instance, error, pollStale, reload, runAction, actionWarnings, clearActionWarnings };
}

export function useInstanceShellHeader(
  instance: InstanceDetail | null,
  runAction: (kind: "start" | "stop" | "restart", options?: { force?: boolean }) => Promise<string[]>,
) {
  const runActionRef = useRef(runAction);
  runActionRef.current = runAction;

  const shellHeader = useMemo(() => {
    if (!instance) return null;

    const displayStatus = instance.status as InstanceStatus;
    const uptime =
      isInstanceLive(displayStatus) && instance.runtime?.uptimeSec != null
        ? `${Math.floor(instance.runtime.uptimeSec / 60)}m uptime`
        : null;
    const memory = instance.runtime?.memoryMb != null ? `${instance.runtime.memoryMb} MB` : null;
    const meta = [instance.slug, instance.branch, `:${instance.config.publicPort}`, uptime, memory]
      .filter(Boolean)
      .join(" · ");

    return {
      title: instance.name,
      status: displayStatus,
      meta,
      actions: (
        <div className="flex gap-2">
          <InstanceActionButtons
            status={displayStatus}
            onAction={(kind) => void runActionRef.current(kind).catch(() => undefined)}
          />
        </div>
      ),
    };
  }, [instance]);

  useShellHeader(shellHeader);
}

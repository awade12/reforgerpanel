"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { ArrowLeftIcon } from "lucide-react";
import type { ServerConfig } from "@/lib/shared/config-schema";
import { InstancePageBanners } from "@/components/instance-page-banners";
import { InstanceSubnav } from "@/components/instance-subnav";
import { Shell, api, ApiError } from "@/components/Shell";
import { useInstance, useInstanceShellHeader, type InstanceDetail } from "@/hooks/use-instance";

interface Scenario {
  id: string;
  name: string;
  source: string;
}

interface Mission {
  slug: string;
  title: string;
}

type InstanceWorkspaceContextValue = {
  id: string;
  instance: InstanceDetail | null;
  error: string;
  pollStale: boolean;
  reload: () => Promise<InstanceDetail>;
  runAction: (kind: "start" | "stop" | "restart", options?: { force?: boolean }) => Promise<string[]>;
  actionWarnings: string[];
  clearActionWarnings: () => void;
  config: ServerConfig | null;
  setConfig: (config: ServerConfig) => void;
  configRaw: string;
  setConfigRaw: (raw: string) => void;
  jsonEditing: boolean;
  setJsonEditing: (editing: boolean) => void;
  scenarios: Scenario[];
  missions: Mission[];
  saving: boolean;
  saveConfig: () => Promise<void>;
  message: string;
  actionError: string;
  notify: (msg: string) => void;
  fail: (msg: string) => void;
};

const InstanceWorkspaceContext = createContext<InstanceWorkspaceContextValue | null>(null);

export function useInstanceWorkspace() {
  const context = useContext(InstanceWorkspaceContext);
  if (!context) {
    throw new Error("useInstanceWorkspace must be used within InstanceWorkspace");
  }
  return context;
}

export function InstanceWorkspace({ children }: { children: React.ReactNode }) {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { instance, error, pollStale, reload, runAction, actionWarnings, clearActionWarnings } = useInstance(id);

  return (
    <Shell contentClassName="max-w-7xl">
      <InstanceWorkspaceInner
        id={id}
        instance={instance}
        error={error}
        pollStale={pollStale}
        reload={reload}
        runAction={runAction}
        actionWarnings={actionWarnings}
        clearActionWarnings={clearActionWarnings}
      >
        {children}
      </InstanceWorkspaceInner>
    </Shell>
  );
}

function InstanceWorkspaceInner({
  id,
  instance,
  error,
  pollStale,
  reload,
  runAction,
  actionWarnings,
  clearActionWarnings,
  children,
}: Omit<
  InstanceWorkspaceContextValue,
  | "config"
  | "setConfig"
  | "configRaw"
  | "setConfigRaw"
  | "jsonEditing"
  | "setJsonEditing"
  | "scenarios"
  | "missions"
  | "saving"
  | "saveConfig"
  | "message"
  | "actionError"
  | "notify"
  | "fail"
> & {
  children: React.ReactNode;
}) {
  const [config, setConfig] = useState<ServerConfig | null>(null);
  const [configRaw, setConfigRaw] = useState("");
  const [jsonEditing, setJsonEditing] = useState(false);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [message, setMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [saving, setSaving] = useState(false);

  const notify = useCallback((msg: string) => {
    setActionError("");
    setMessage(msg);
  }, []);

  const fail = useCallback((msg: string) => {
    setMessage("");
    setActionError(msg);
  }, []);

  const handleHeaderAction = useCallback(
    async (kind: "start" | "stop" | "restart", options?: { force?: boolean }) => {
      try {
        clearActionWarnings();
        fail("");
        return await runAction(kind, options);
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Action failed";
        fail(err instanceof ApiError && err.status === 409 ? `${msg} — open Network tab for details.` : msg);
        return [];
      }
    },
    [clearActionWarnings, fail, runAction],
  );

  useInstanceShellHeader(instance, handleHeaderAction);

  const configHydratedForId = useRef<string | null>(null);

  useEffect(() => {
    configHydratedForId.current = null;
  }, [id]);

  useEffect(() => {
    if (!instance || instance.id !== id) return;
    if (configHydratedForId.current === id) return;
    configHydratedForId.current = id;
    setConfig(instance.config);
    setConfigRaw(JSON.stringify(instance.config, null, 2));
  }, [id, instance]);

  useEffect(() => {
    if (!instance) return;
    void api<Scenario[]>(`scenarios?branch=${instance.branch}`)
      .then(setScenarios)
      .catch(() => undefined);
    void api<Mission[]>("missions")
      .then(setMissions)
      .catch(() => undefined);
  }, [instance?.branch, instance]);

  const saveConfig = useCallback(async () => {
    clearActionWarnings();
    fail("");
    setMessage("");
    setSaving(true);
    try {
      const payload = jsonEditing ? JSON.parse(configRaw) : config;
      await api(`instances/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: payload }),
      });
      notify("Configuration saved");
      setJsonEditing(false);
      const data = await reload();
      configHydratedForId.current = id;
      setConfig(data.config);
      setConfigRaw(JSON.stringify(data.config, null, 2));
    } catch (err) {
      fail(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [clearActionWarnings, config, configRaw, fail, id, jsonEditing, notify, reload]);

  return (
    <InstanceWorkspaceContext.Provider
      value={{
        id,
        instance,
        error,
        pollStale,
        reload,
        runAction,
        actionWarnings,
        clearActionWarnings,
        config,
        setConfig,
        configRaw,
        setConfigRaw,
        jsonEditing,
        setJsonEditing,
        scenarios,
        missions,
        saving,
        saveConfig,
        message,
        actionError,
        notify,
        fail,
      }}
    >
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" />
        Dashboard
      </Link>

      <InstanceSubnav id={id} />
      <InstancePageBanners />

      {children}
    </InstanceWorkspaceContext.Provider>
  );
}

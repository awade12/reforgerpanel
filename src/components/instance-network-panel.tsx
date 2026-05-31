"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ServerConfig } from "@/lib/shared/config-schema";
import { buildRegistrationDiagnostics, buildUfwRulesDisplay, resolveInstancePorts } from "@/lib/shared/network-ports";
import { Button, api, ApiError } from "@/components/Shell";

type RegistrationCheck = {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
};

type Diagnostics = {
  registration: {
    ports: ReturnType<typeof resolveInstancePorts>;
    checks: RegistrationCheck[];
    allOk: boolean;
  };
  battleyeWarnings: string[];
  modChecks: { modId: string; name?: string; ok: boolean; detail: string }[];
  a2s: {
    listed: boolean;
    playerCount: string;
    players: number | null;
    error: string | null;
  } | null;
};

function localDiagnostics(config: ServerConfig): Diagnostics {
  return {
    registration: buildRegistrationDiagnostics(config),
    battleyeWarnings: [],
    modChecks: [],
    a2s: null,
  };
}

export function InstanceNetworkPanel({
  id,
  config,
  slug,
  status,
  onMessage,
  onError,
}: {
  id: string;
  config: ServerConfig;
  slug: string;
  status: string;
  onMessage: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [diagnostics, setDiagnostics] = useState<Diagnostics>(() => localDiagnostics(config));
  const [loading, setLoading] = useState(false);
  const [firewallBusy, setFirewallBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const ports = useMemo(() => resolveInstancePorts(config), [config]);
  const ufwRules = useMemo(() => buildUfwRulesDisplay(ports, slug), [ports, slug]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<Diagnostics>(`instances/${id}/diagnostics`);
      setDiagnostics(data);
      setLoadError("");
    } catch (err) {
      const message = err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Diagnostics failed";
      setDiagnostics(localDiagnostics(config));
      setLoadError(
        message === "Not found"
          ? "Host agent is running old code — restart it with npm run agent to enable live A2S and BattlEye checks."
          : message,
      );
    } finally {
      setLoading(false);
    }
  }, [config, id]);

  useEffect(() => {
    setDiagnostics(localDiagnostics(config));
    void refresh();
    const timer = setInterval(() => {
      if (status === "running") void refresh();
    }, 15000);
    return () => clearInterval(timer);
  }, [config, id, refresh, status]);

  async function applyFirewall() {
    onError("");
    setFirewallBusy(true);
    try {
      const result = await api<{ applied: string[]; errors: string[] }>(`instances/${id}/firewall`, {
        method: "POST",
      });
      if (result.errors.length) {
        onError(result.errors.join("; "));
      } else {
        onMessage(`Applied ${result.applied.length} UFW rules`);
      }
    } catch (err) {
      onError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Firewall update failed");
    } finally {
      setFirewallBusy(false);
    }
  }

  function copyRules() {
    void navigator.clipboard.writeText(ufwRules.join("\n"));
    onMessage("UFW rules copied");
  }

  const checks = diagnostics.registration.checks;

  return (
    <section className="mb-8 border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <p className="font-mono text-[11px] text-muted-foreground">Network</p>
        <h2 className="mt-0.5 text-sm font-medium text-foreground">Ports, firewall, and browser registration</h2>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-2">
        <div className="border border-border p-3">
          <p className="text-xs font-medium text-foreground">Ports to open (UDP)</p>
          <dl className="mt-3 space-y-2 font-mono text-xs text-muted-foreground">
            <div className="flex justify-between gap-3">
              <dt>Game</dt>
              <dd className="text-foreground">{ports.game}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>A2S query</dt>
              <dd className="text-foreground">{ports.a2s}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>RCon</dt>
              <dd className="text-foreground">{ports.rcon}</dd>
            </div>
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="ghost" onClick={copyRules}>
              Copy UFW rules
            </Button>
            <Button variant="ghost" disabled={firewallBusy} onClick={() => void applyFirewall()}>
              {firewallBusy ? "Applying…" : "Apply UFW rules"}
            </Button>
          </div>
          <pre className="mt-3 overflow-x-auto bg-[#141820] p-3 font-mono text-[10px] leading-5 text-[#c5cad4]">
            {ufwRules.join("\n")}
          </pre>
        </div>

        <div className="border border-border p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-foreground">Registration diagnostics</p>
            <Button variant="ghost" disabled={loading} onClick={() => void refresh()}>
              {loading ? "Checking…" : "Refresh"}
            </Button>
          </div>
          {loadError && <p className="mt-2 text-xs text-[#d4a574]">{loadError}</p>}
          {diagnostics.a2s && (
            <p className="mt-2 text-xs text-muted-foreground">
              A2S: {diagnostics.a2s.listed ? `listed · ${diagnostics.a2s.playerCount}` : diagnostics.a2s.error || "not listed"}
            </p>
          )}
          <ul className="mt-3 space-y-2">
            {checks.map((check) => (
              <li key={check.id} className="border border-border px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-foreground">{check.label}</span>
                  <span className={check.ok ? "text-xs text-chart-1" : "text-xs text-[#d4a574]"}>
                    {check.ok ? "OK" : "Check"}
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{check.detail}</p>
              </li>
            ))}
          </ul>
          {diagnostics.battleyeWarnings.length > 0 && (
            <div className="mt-3 border border-[#d4a574]/30 bg-[#d4a574]/10 px-3 py-2">
              <p className="text-xs font-medium text-[#d4a574]">BattlEye warnings</p>
              <ul className="mt-1 list-disc pl-4 text-[11px] text-[#d4a574]/90">
                {diagnostics.battleyeWarnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

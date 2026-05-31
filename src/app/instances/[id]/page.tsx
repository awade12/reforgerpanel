"use client";

import { InstanceConfigEditor } from "@/components/instance-config-editor";
import { InstanceOverviewStrip } from "@/components/instance-overview-strip";
import { InstancePlayersSummary } from "@/components/instance-players-panel";
import { useInstanceWorkspace } from "@/components/instance-workspace";
import { Button, LinkButton } from "@/components/Shell";

export default function InstanceSettingsPage() {
  const {
    id,
    instance,
    error,
    config,
    setConfig,
    configRaw,
    setConfigRaw,
    setJsonEditing,
    scenarios,
    saving,
    saveConfig,
  } = useInstanceWorkspace();

  if (!instance || !config) {
    return <p className="text-sm text-muted-foreground">{error || "Loading instance…"}</p>;
  }

  return (
    <>
      <InstanceOverviewStrip />
      <InstancePlayersSummary id={id} status={instance.status} />

      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] text-muted-foreground">Configuration</p>
            <h2 className="mt-1 text-lg font-medium text-foreground">Server settings</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Name, scenario, passwords, and network basics. Use other tabs for ports, mods, RCon, and alerts.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <LinkButton href={`/instances/${id}/logs`} variant="ghost">
              Logs
            </LinkButton>
            <Button disabled={saving} onClick={() => void saveConfig()}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>

        <InstanceConfigEditor
          config={config}
          configRaw={configRaw}
          scenarioOptions={scenarios}
          onConfigChange={setConfig}
          onConfigRawChange={setConfigRaw}
          onJsonEditingChange={setJsonEditing}
        />

        <p className="mt-3 text-xs text-muted-foreground">Restart after changing ports, scenario, or network settings.</p>
      </section>
    </>
  );
}

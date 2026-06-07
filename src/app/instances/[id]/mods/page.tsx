"use client";

import { InstanceModsPanel } from "@/components/instance-mods-panel";
import { useInstanceWorkspace } from "@/components/instance-workspace";
import { Button } from "@/components/Shell";

export default function InstanceModsPage() {
  const { id, instance, error, config, setConfig, missions, saving, saveConfig, notify, fail } = useInstanceWorkspace();

  if (!instance || !config) {
    return <p className="text-sm text-muted-foreground">{error || "Loading instance…"}</p>;
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] text-muted-foreground">Workshop</p>
          <h1 className="mt-1 text-lg font-medium text-foreground">Mods & missions</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Add workshop mods, refresh cached files, and apply mission presets. Save after editing the mod list.
          </p>
        </div>
        <Button disabled={saving} onClick={() => void saveConfig()}>
          {saving ? "Saving…" : "Save mod list"}
        </Button>
      </div>

      <InstanceModsPanel
        id={id}
        config={config}
        missions={missions}
        onConfigChange={setConfig}
        onApplied={notify}
        onError={fail}
      />
    </>
  );
}

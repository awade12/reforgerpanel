"use client";

import { InstanceAdvancedPanel } from "@/components/instance-advanced-panel";
import { InstanceAlertsPanel } from "@/components/instance-alerts-panel";
import { InstanceBackupPanel } from "@/components/instance-backup-panel";
import { InstanceBattleyePanel } from "@/components/instance-battleye-panel";
import { InstanceClonePanel } from "@/components/instance-clone-panel";
import { InstanceRotationPanel } from "@/components/instance-rotation-panel";
import { InstanceOpsPanel } from "@/components/instance-ops-panel";
import { useInstanceWorkspace } from "@/components/instance-workspace";

export default function InstanceAdminPage() {
  const { id, instance, error, config, reload, notify, fail } = useInstanceWorkspace();

  if (!instance || !config) {
    return <p className="text-sm text-muted-foreground">{error || "Loading instance…"}</p>;
  }

  return (
    <>
      <div className="mb-6">
        <p className="font-mono text-[11px] text-muted-foreground">Administration</p>
        <h1 className="mt-1 text-lg font-medium text-foreground">Advanced & RCon</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Launch options, Discord alerts, BattlEye RCon, rename, and delete.
        </p>
      </div>

      <InstanceAdvancedPanel
        id={id}
        instance={instance}
        onSaved={async (msg) => {
          notify(msg);
          await reload();
        }}
        onError={fail}
      />

      <InstanceBackupPanel id={id} onMessage={notify} onError={fail} />

      <InstanceClonePanel
        id={id}
        defaultName={instance.name}
        onMessage={notify}
        onError={fail}
      />

      <InstanceRotationPanel id={id} onMessage={notify} onError={fail} />

      <InstanceAlertsPanel
        id={id}
        instance={instance}
        onSaved={async (msg) => {
          notify(msg);
          await reload();
        }}
        onError={fail}
      />

      <InstanceBattleyePanel id={id} config={config} onMessage={notify} onError={fail} />

      <InstanceOpsPanel
        id={id}
        panelName={instance.name}
        onRenamed={async (msg) => {
          notify(msg);
          await reload();
        }}
        onError={fail}
      />
    </>
  );
}

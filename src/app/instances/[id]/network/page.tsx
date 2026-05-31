"use client";

import { InstanceNetworkPanel } from "@/components/instance-network-panel";
import { useInstanceWorkspace } from "@/components/instance-workspace";

export default function InstanceNetworkPage() {
  const { id, instance, error, config, notify, fail } = useInstanceWorkspace();

  if (!instance || !config) {
    return <p className="text-sm text-muted-foreground">{error || "Loading instance…"}</p>;
  }

  return (
    <>
      <div className="mb-6">
        <p className="font-mono text-[11px] text-muted-foreground">Network</p>
        <h1 className="mt-1 text-lg font-medium text-foreground">Ports & registration</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Public address, game port, A2S, RCon bindings, firewall rules, and browser listing checks.
        </p>
      </div>

      <InstanceNetworkPanel
        id={id}
        config={config}
        slug={instance.slug}
        status={instance.status}
        onMessage={notify}
        onError={fail}
      />
    </>
  );
}

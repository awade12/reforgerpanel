"use client";

import { InstanceNetworkPanel } from "@/components/instance-network-panel";
import { useInstanceWorkspace } from "@/components/instance-workspace";
import { ApiError } from "@/components/Shell";

export default function InstanceNetworkPage() {
  const { id, instance, error, config, notify, fail, runAction } = useInstanceWorkspace();

  if (!instance || !config) {
    return <p className="text-sm text-muted-foreground">{error || "Loading instance…"}</p>;
  }

  async function forceStart() {
    try {
      await runAction("start", { force: true });
      notify("Instance started (pre-flight overridden)");
    } catch (err) {
      fail(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Start failed");
    }
  }

  return (
    <>
      <div className="mb-6">
        <p className="font-mono text-[11px] text-muted-foreground">Network</p>
        <h1 className="mt-1 text-lg font-medium text-foreground">Pre-flight & network</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Runs config, firewall, and connectivity checks before start. Fix blocking items here first.
        </p>
      </div>

      <InstanceNetworkPanel
        id={id}
        config={config}
        slug={instance.slug}
        status={instance.status}
        onMessage={notify}
        onError={fail}
        onForceStart={() => void forceStart()}
      />
    </>
  );
}

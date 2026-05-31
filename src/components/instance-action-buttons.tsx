"use client";

import type { InstanceStatus } from "@/lib/shared/types";
import { isInstanceBusy, isInstanceLive } from "@/lib/shared/instance-state";
import { Button } from "@/components/Shell";

export function InstanceActionButtons({
  status,
  onAction,
  disabled,
}: {
  status: InstanceStatus;
  onAction: (kind: "start" | "stop" | "restart") => void;
  disabled?: boolean;
}) {
  const live = isInstanceLive(status);
  const busy = isInstanceBusy(status);

  if (busy) {
    return (
      <Button disabled={disabled ?? true}>{status === "starting" ? "Starting…" : "Stopping…"}</Button>
    );
  }

  if (live) {
    return (
      <>
        <Button variant="ghost" disabled={disabled} onClick={() => onAction("stop")}>
          Stop
        </Button>
        <Button disabled={disabled} onClick={() => onAction("restart")}>
          Restart
        </Button>
      </>
    );
  }

  return (
    <Button disabled={disabled} onClick={() => onAction("start")}>
      Start
    </Button>
  );
}

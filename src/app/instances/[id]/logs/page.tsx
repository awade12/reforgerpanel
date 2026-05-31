"use client";

import { LiveLogViewer } from "@/components/live-log-viewer";
import { useInstanceWorkspace } from "@/components/instance-workspace";
import { useInstanceLogs } from "@/hooks/use-instance-logs";
import { InstanceActionButtons } from "@/components/instance-action-buttons";

export default function InstanceLogsPage() {
  const { id, instance, error, runAction } = useInstanceWorkspace();
  const { logs, logFile, fps, followTail, setFollowTail, clear, reload, streaming } = useInstanceLogs(id, Boolean(instance));

  if (!instance) {
    return <p className="text-sm text-muted-foreground">{error || "Loading instance…"}</p>;
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] text-muted-foreground">Instance output</p>
          <h1 className="mt-1 text-lg font-medium text-foreground">Server logs</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Live console output streamed from the agent{streaming ? " over SSE" : ""}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:hidden">
          <InstanceActionButtons
            status={instance.status}
            onAction={(kind) => void runAction(kind)}
          />
        </div>
      </div>

      <LiveLogViewer
        fullPage
        logs={logs}
        logFile={logFile}
        fps={fps}
        followTail={followTail}
        onFollowTailChange={setFollowTail}
        onClear={clear}
        onRefresh={() => void reload()}
      />
    </>
  );
}

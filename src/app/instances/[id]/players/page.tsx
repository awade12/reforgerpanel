"use client";

import { InstancePlayersPanel } from "@/components/instance-players-panel";
import { useInstanceWorkspace } from "@/components/instance-workspace";

export default function InstancePlayersPage() {
  const { id, instance, error } = useInstanceWorkspace();

  if (!instance) {
    return <p className="text-sm text-muted-foreground">{error || "Loading instance…"}</p>;
  }

  return (
    <InstancePlayersPanel id={id} status={instance.status} maxPlayers={instance.config.game.maxPlayers} />
  );
}

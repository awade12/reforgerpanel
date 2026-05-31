"use client";

import { useCallback, useEffect, useState } from "react";
import type { ServerConfig } from "@/lib/shared/config-schema";
import { formatRconOutput, formatPlayersForDisplay } from "@/lib/shared/rcon";
import { SECRET_MASK } from "@/lib/shared/secrets";
import { Button, Input, api, ApiError } from "@/components/Shell";
import { cn } from "@/lib/utils";

interface BattleyeData {
  content: string;
  path: string;
  rconPort: number | null;
  rconPassword: string | null;
  hasRconPassword: boolean;
  warnings: string[];
}

export function InstanceBattleyePanel({
  id,
  config,
  onMessage,
  onError,
}: {
  id: string;
  config: ServerConfig;
  onMessage: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [battleyePort, setBattleyePort] = useState("");
  const [battleyePassword, setBattleyePassword] = useState("");
  const [fileContent, setFileContent] = useState("");
  const [filePath, setFilePath] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [command, setCommand] = useState("#players");
  const [commandOutput, setCommandOutput] = useState("");
  const [players, setPlayers] = useState<{ id: number; name: string; guid: string; ping: number }[]>([]);
  const [runningCommand, setRunningCommand] = useState(false);

  const loadBattleye = useCallback(async () => {
    const data = await api<BattleyeData>(`instances/${id}/battleye`);
    setFileContent(data.content);
    setFilePath(data.path);
    setWarnings(data.warnings);
    if (data.rconPort != null) setBattleyePort(String(data.rconPort));
    else if (config.rcon?.port) setBattleyePort(String(config.rcon.port));
    else setBattleyePort("19999");

    if (data.rconPassword) setBattleyePassword(data.rconPassword);
    else if (data.hasRconPassword) setBattleyePassword(SECRET_MASK);
    else if (config.rcon?.password) setBattleyePassword(config.rcon.password);
  }, [id, config.rcon?.port, config.rcon?.password]);

  useEffect(() => {
    void loadBattleye().catch(() => undefined);
  }, [loadBattleye]);

  async function saveBattleye() {
    onError("");
    onMessage("");
    if (warnings.some((w) => w.includes("GameID") || w.includes("MasterPort"))) {
      onError("Fix GameID/MasterPort first (start server once or use Steam validate) before appending RCon.");
      return;
    }
    if (
      battleyePassword !== SECRET_MASK &&
      (!battleyePassword || battleyePassword.includes(" ") || battleyePassword.length < 3)
    ) {
      onError("RCon password must be at least 3 characters with no spaces.");
      return;
    }
    setSaving(true);
    try {
      await api(`instances/${id}/battleye`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rconPort: Number(battleyePort), rconPassword: battleyePassword }),
      });
      onMessage("BattlEye RCon settings appended");
      await loadBattleye();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "BattlEye save failed");
    } finally {
      setSaving(false);
    }
  }

  async function refreshPlayers() {
    onError("");
    setRunningCommand(true);
    try {
      const data = await api<{ output?: string; raw: string; players: { id: number; name: string; guid: string; ping: number }[] }>(
        `instances/${id}/bercon/players`,
      );
      const raw = data.raw ?? data.output ?? "";
      setCommandOutput(formatPlayersForDisplay(raw));
      setPlayers(data.players);
    } catch (err) {
      onError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "RCon command failed");
    } finally {
      setRunningCommand(false);
    }
  }

  async function runCommand(nextCommand?: string) {
    onError("");
    setRunningCommand(true);
    try {
      const cmd = (nextCommand ?? command).trim();
      if (cmd === "players" || cmd === "#players") {
        await refreshPlayers();
        return;
      }
      const data = await api<{ output: string }>(`instances/${id}/bercon/command`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: cmd }),
      });
      setCommandOutput(formatRconOutput(data.output) || "(command sent — no text response)");
      setPlayers([]);
    } catch (err) {
      onError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "RCon command failed");
    } finally {
      setRunningCommand(false);
    }
  }

  async function kickPlayer(playerId: number) {
    await runCommand(`kick ${playerId}`);
    onMessage(`Kick sent for player ${playerId}`);
  }

  async function banPlayer(playerId: number) {
    await runCommand(`ban ${playerId}`);
    onMessage(`Ban sent for player ${playerId}`);
  }

  async function repairBattleye() {
    onError("");
    onMessage("");
    setRepairing(true);
    try {
      await api(`instances/${id}/battleye/repair`, { method: "POST" });
      onMessage("BattlEye repair triggered — delete cfg + Steam validate");
      await loadBattleye();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Repair failed");
    } finally {
      setRepairing(false);
    }
  }

  const critical = warnings.filter((w) => w.includes("GameID") || w.includes("MasterPort") || w.includes("missing"));

  return (
    <section className="border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <p className="font-mono text-[11px] text-muted-foreground">BattlEye</p>
        <h2 className="mt-0.5 text-sm font-medium text-foreground">RCon config</h2>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          Append-only edits to BEServer_x64.cfg under the instance profile. Never remove GameID or MasterPort lines.
          After appending RCon, restart the server — BattlEye only listens once the cfg exists and the instance is running.
        </p>
      </div>

      {warnings.length > 0 && (
        <div className="space-y-2 border-b border-border px-4 py-3">
          {warnings.map((warning) => (
            <p
              key={warning}
              className={cn(
                "text-xs leading-5",
                warning.includes("GameID") || warning.includes("MasterPort")
                  ? "text-destructive"
                  : "text-[#d4a574]",
              )}
            >
              {warning}
            </p>
          ))}
        </div>
      )}

      <div className="grid gap-4 p-4 sm:grid-cols-2">
        <Input label="RCon port" value={battleyePort} onChange={setBattleyePort} />
        <Input label="RCon password" value={battleyePassword} onChange={setBattleyePassword} />
      </div>

      {filePath && (
        <div className="border-t border-border px-4 py-3">
          <p className="mb-2 font-mono text-[10px] text-muted-foreground">Current file · {filePath}</p>
          <pre className="max-h-40 overflow-auto bg-[#141820] p-3 font-mono text-[10px] leading-5 text-[#c5cad4]">
            {fileContent.trim() || "(empty — created on first server start)"}
          </pre>
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-t border-border px-4 py-4">
        <Button disabled={saving || critical.length > 0} onClick={() => void saveBattleye()}>
          {saving ? "Appending…" : "Append RCon"}
        </Button>
        <Button variant="ghost" disabled={repairing} onClick={() => void repairBattleye()}>
          {repairing ? "Repairing…" : "Steam validate"}
        </Button>
      </div>

      <div className="border-t border-border px-4 py-4">
        <p className="text-xs font-medium text-foreground">RCon terminal</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Uses Reforger RCon over UDP (#players, #kick, #ban, #restart). Server must be running. An empty list means no
          players are connected.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            className="min-w-[16rem] flex-1 border border-input bg-background px-3 py-2 font-mono text-xs"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
          />
          <Button disabled={runningCommand} onClick={() => void runCommand()}>
            {runningCommand ? "Running…" : "Run"}
          </Button>
          <Button variant="ghost" disabled={runningCommand} onClick={() => void refreshPlayers()}>
            Refresh players
          </Button>
        </div>
        <div className="mt-3 border border-border bg-[#141820] p-3">
          <p className="mb-2 font-mono text-[10px] text-muted-foreground">Response</p>
          <pre className="max-h-40 overflow-auto font-mono text-[10px] leading-5 text-[#c5cad4]">
            {commandOutput || (runningCommand ? "Waiting for server…" : "Run a command to see the response here.")}
          </pre>
        </div>
        <div className="mt-3 overflow-x-auto border border-border">
          <div className="border-b border-border px-3 py-2 text-xs text-muted-foreground">
            Parsed players ({players.length})
          </div>
          {players.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-muted-foreground">No players connected.</p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-1 pr-3">ID</th>
                  <th className="py-1 pr-3">Name</th>
                  <th className="py-1 pr-3">Ping</th>
                  <th className="py-1">Actions</th>
                </tr>
              </thead>
              <tbody>
                {players.map((player) => (
                  <tr key={player.id} className="border-t border-border">
                    <td className="py-2 pr-3 font-mono">{player.id}</td>
                    <td className="py-2 pr-3">{player.name}</td>
                    <td className="py-2 pr-3">{player.ping}</td>
                    <td className="py-2">
                      <div className="flex gap-2">
                        <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => void kickPlayer(player.id)}>
                          Kick
                        </button>
                        <button type="button" className="text-destructive hover:opacity-80" onClick={() => void banPlayer(player.id)}>
                          Ban
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>
  );
}

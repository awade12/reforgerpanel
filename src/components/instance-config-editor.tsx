"use client";

import { useEffect, useState } from "react";
import type { ServerConfig } from "@/lib/shared/config-schema";
import { FieldHint } from "@/components/field-hint";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

function SettingRow({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-2 border-b border-border py-4 sm:grid-cols-[12rem_1fr] sm:items-center sm:gap-8", className)}>
      <div className="flex items-center gap-2">
        <p className="text-sm text-foreground">{label}</p>
        {hint && <FieldHint label={label} text={hint} />}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="border-b border-border pb-2 pt-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
      {children}
    </p>
  );
}

function TextInput({
  value,
  onChange,
  type = "text",
  placeholder,
  mono,
  disabled,
}: {
  value: string | number;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  mono?: boolean;
  disabled?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "w-full border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-foreground/30 disabled:cursor-not-allowed disabled:opacity-50",
        mono && "font-mono text-xs",
      )}
    />
  );
}

export function InstanceConfigEditor({
  config,
  configRaw,
  onConfigChange,
  onConfigRawChange,
  onJsonEditingChange,
  scenarioOptions,
}: {
  config: ServerConfig;
  configRaw: string;
  onConfigChange: (config: ServerConfig) => void;
  onConfigRawChange: (raw: string) => void;
  onJsonEditingChange?: (editing: boolean) => void;
  scenarioOptions?: { id: string; name: string; source: string }[];
}) {
  const [jsonError, setJsonError] = useState("");
  const [jsonEditing, setJsonEditing] = useState(false);

  useEffect(() => {
    if (!jsonEditing) {
      onConfigRawChange(JSON.stringify(config, null, 2));
      setJsonError("");
    }
  }, [config, jsonEditing, onConfigRawChange]);

  useEffect(() => {
    onJsonEditingChange?.(jsonEditing);
  }, [jsonEditing, onJsonEditingChange]);

  function setJsonMode(editing: boolean) {
    if (!editing && jsonEditing) {
      try {
        onConfigChange(JSON.parse(configRaw) as ServerConfig);
        setJsonError("");
      } catch {
        setJsonError("Invalid JSON — fix syntax before switching back to form.");
        return;
      }
    }
    setJsonEditing(editing);
  }

  function patch(partial: Partial<ServerConfig>) {
    onConfigChange({ ...config, ...partial });
  }

  function patchGame(partial: Partial<ServerConfig["game"]>) {
    onConfigChange({ ...config, game: { ...config.game, ...partial } });
  }

  function patchGameProperties(partial: Partial<NonNullable<ServerConfig["game"]["gameProperties"]>>) {
    onConfigChange({
      ...config,
      game: { ...config.game, gameProperties: { ...config.game.gameProperties, ...partial } },
    });
  }

  function patchRcon(partial: Partial<NonNullable<ServerConfig["rcon"]>>) {
    onConfigChange({ ...config, rcon: { ...config.rcon, ...partial } });
  }

  function patchA2s(partial: Partial<NonNullable<ServerConfig["a2s"]>>) {
    onConfigChange({ ...config, a2s: { ...config.a2s, ...partial } });
  }

  function patchOperating(partial: Partial<NonNullable<ServerConfig["operating"]>>) {
    onConfigChange({
      ...config,
      operating: { ...config.operating, ...partial },
    });
  }

  function patchJoinQueue(maxSize: number) {
    onConfigChange({
      ...config,
      operating: {
        ...config.operating,
        joinQueue: { ...config.operating?.joinQueue, maxSize },
      },
    });
  }

  const adminsText = config.game.admins.join("\n");
  const formDisabled = jsonEditing;
  const scenarios = scenarioOptions ?? [];

  return (
    <div className="grid border border-border bg-card xl:grid-cols-2">
      <div className={cn("px-5 py-2 sm:px-6", jsonEditing && "opacity-40")}>
        <div className="mb-2 flex items-center justify-between gap-3 border-b border-border pb-4 pt-2">
          <div>
            <h3 className="text-sm font-medium text-foreground">Settings</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Edit common server options here, or switch to JSON on the right for the full config file.
            </p>
          </div>
        </div>

        <GroupLabel>Server</GroupLabel>
        <SettingRow label="Name" hint="Display name shown in the server browser and join list.">
          <TextInput disabled={formDisabled} value={config.game.name} onChange={(v) => patchGame({ name: v })} />
        </SettingRow>
        <SettingRow label="Max players" hint="Maximum players connected at once (1–128).">
          <TextInput
            disabled={formDisabled}
            type="number"
            value={config.game.maxPlayers}
            onChange={(v) => patchGame({ maxPlayers: Number(v) || 1 })}
          />
        </SettingRow>
        <SettingRow label="Join password" hint="Required to connect. Leave empty for a public server anyone can join.">
          <TextInput disabled={formDisabled} value={config.game.password} onChange={(v) => patchGame({ password: v })} />
        </SettingRow>
        <SettingRow label="Admin password" hint="In-game admin login password (#login in chat).">
          <TextInput
            disabled={formDisabled}
            value={config.game.passwordAdmin}
            onChange={(v) => patchGame({ passwordAdmin: v })}
          />
        </SettingRow>
        <SettingRow label="Server browser" hint="When off, the server is hidden from the public list. Direct connect by IP still works.">
          <Switch
            disabled={formDisabled}
            checked={config.game.visible}
            onCheckedChange={(visible) => patchGame({ visible })}
          />
        </SettingRow>
        <SettingRow label="Crossplay" hint="Allow console players (Xbox / PlayStation) to join. Off = PC only.">
          <Switch
            disabled={formDisabled}
            checked={config.game.crossPlatform ?? false}
            onCheckedChange={(crossPlatform) =>
              patchGame({
                crossPlatform,
                supportedPlatforms: crossPlatform
                  ? ["PLATFORM_PC", "PLATFORM_XBL", "PLATFORM_PSN"]
                  : ["PLATFORM_PC"],
              })
            }
          />
        </SettingRow>

        <GroupLabel>Network</GroupLabel>
        <SettingRow
          label="Public IP"
          hint="Address reported to the backend and shown to players. Replaces the old gameHostRegisterBindAddress field. Leave empty only if auto-detection works on your host."
        >
          <TextInput
            disabled={formDisabled}
            value={config.publicAddress}
            onChange={(v) => patch({ publicAddress: v })}
            placeholder="203.0.113.10"
          />
        </SettingRow>
        <SettingRow
          label="Bind address"
          hint="Local IP the server listens on. Leave empty for all interfaces. Useful on Docker/VPS when registration fails."
        >
          <TextInput
            disabled={formDisabled}
            value={config.bindAddress ?? ""}
            onChange={(v) => patch({ bindAddress: v })}
            placeholder="0.0.0.0 or specific LAN IP"
          />
        </SettingRow>
        <SettingRow
          label="Game port"
          hint="Main UDP port for game traffic. Forward this port (and the A2S query port) on your router for external access."
        >
          <TextInput
            disabled={formDisabled}
            type="number"
            value={config.publicPort}
            onChange={(v) => patch({ publicPort: Number(v) || 0, bindPort: Number(v) || 0 })}
          />
        </SettingRow>

        <GroupLabel>Mission</GroupLabel>
        <SettingRow
          label="Scenario"
          hint="Mission .conf this instance runs. Source shows which mod or base game provides it."
        >
          {scenarios.length > 0 ? (
            <div className="space-y-2">
              <select
                disabled={formDisabled}
                className="w-full border border-input bg-background px-3 py-2 text-sm text-foreground outline-none disabled:opacity-50"
                value={config.game.scenarioId}
                onChange={(e) => patchGame({ scenarioId: e.target.value })}
              >
                {scenarios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.source})
                  </option>
                ))}
              </select>
              <p className="truncate font-mono text-[10px] text-muted-foreground">{config.game.scenarioId}</p>
            </div>
          ) : (
            <TextInput
              disabled={formDisabled}
              mono
              value={config.game.scenarioId}
              onChange={(v) => patchGame({ scenarioId: v })}
            />
          )}
        </SettingRow>

        <GroupLabel>Access</GroupLabel>
        <SettingRow label="Admin GUIDs" hint="Bohemia Interactive GUIDs granted admin rights. One per line — find yours in the game's profile settings.">
          <textarea
            disabled={formDisabled}
            rows={3}
            value={adminsText}
            onChange={(e) =>
              patchGame({
                admins: e.target.value
                  .split("\n")
                  .map((line) => line.trim())
                  .filter(Boolean),
              })
            }
            className="w-full border border-input bg-background px-3 py-2 font-mono text-xs text-foreground outline-none focus:border-foreground/30 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </SettingRow>

        <details className="group pb-4">
          <summary className="cursor-pointer list-none border-b border-border py-4 font-mono text-[10px] uppercase tracking-wider text-muted-foreground marker:content-none [&::-webkit-details-marker]:hidden">
            <span className="group-open:text-foreground">More options</span>
          </summary>
          <div className={cn(formDisabled && "pointer-events-none opacity-50")}>
            <SettingRow label="BattlEye" hint="Anti-cheat. Keep enabled for public internet servers.">
              <Switch
                checked={config.game.gameProperties?.battlEye ?? true}
                onCheckedChange={(battlEye) => patchGameProperties({ battlEye })}
              />
            </SettingRow>
            <SettingRow label="Third person" hint="When off, players are forced into first-person view only.">
              <Switch
                checked={!(config.game.gameProperties?.disableThirdPerson ?? false)}
                onCheckedChange={(on) => patchGameProperties({ disableThirdPerson: !on })}
              />
            </SettingRow>
            <SettingRow
              label="A2S bind address"
              hint="Leave empty to listen on all interfaces. Do not set this to your public IP — use Public address above for that."
            >
              <TextInput value={config.a2s?.address ?? ""} onChange={(v) => patchA2s({ address: v })} placeholder="empty or 0.0.0.0" />
            </SettingRow>
            <SettingRow
              label="A2S port"
              hint="Steam server query port used by the browser list. Usually auto-derived from the game port if set to 0."
            >
              <TextInput
                type="number"
                value={config.a2s?.port ?? 0}
                onChange={(v) => patchA2s({ port: Number(v) || 0 })}
              />
            </SettingRow>
            <SettingRow
              label="RCon port"
              hint="BattlEye remote admin port. The BattlEye tab appends this to BEServer_x64.cfg — never erase that file by hand."
            >
              <TextInput
                type="number"
                value={config.rcon?.port ?? 0}
                onChange={(v) => patchRcon({ port: Number(v) || 0 })}
              />
            </SettingRow>
            <SettingRow
              label="RCon password"
              hint="BattlEye RCon password for remote admin tools. Use the BattlEye tab to append; verify game files if RCon stops working."
            >
              <TextInput value={config.rcon?.password ?? ""} onChange={(v) => patchRcon({ password: v })} />
            </SettingRow>
            <SettingRow label="RCon permission" hint="admin = full commands, monitor = read-only.">
              <select
                className="w-full border border-input bg-background px-3 py-2 text-sm"
                value={config.rcon?.permission ?? "monitor"}
                onChange={(e) => patchRcon({ permission: e.target.value as "admin" | "monitor" })}
              >
                <option value="monitor">monitor</option>
                <option value="admin">admin</option>
              </select>
            </SettingRow>
            <SettingRow label="RCon max clients" hint="Maximum simultaneous RCon connections (1–16).">
              <TextInput
                type="number"
                value={config.rcon?.maxClients ?? 4}
                onChange={(v) => patchRcon({ maxClients: Number(v) || 4 })}
              />
            </SettingRow>
            <SettingRow label="RCon whitelist" hint="Optional IP whitelist, one per line.">
              <textarea
                rows={2}
                value={(config.rcon?.whitelist ?? []).join("\n")}
                onChange={(e) =>
                  patchRcon({
                    whitelist: e.target.value
                      .split("\n")
                      .map((line) => line.trim())
                      .filter(Boolean),
                  })
                }
                className="w-full border border-input bg-background px-3 py-2 font-mono text-xs"
              />
            </SettingRow>
            <SettingRow label="RCon blacklist" hint="Optional IP blacklist, one per line.">
              <textarea
                rows={2}
                value={(config.rcon?.blacklist ?? []).join("\n")}
                onChange={(e) =>
                  patchRcon({
                    blacklist: e.target.value
                      .split("\n")
                      .map((line) => line.trim())
                      .filter(Boolean),
                  })
                }
                className="w-full border border-input bg-background px-3 py-2 font-mono text-xs"
              />
            </SettingRow>
            <SettingRow label="View distance" hint="Maximum render distance in metres (500–10000). Lower values can improve performance.">
              <TextInput
                type="number"
                value={config.game.gameProperties?.serverMaxViewDistance ?? 1600}
                onChange={(v) => patchGameProperties({ serverMaxViewDistance: Number(v) || 1600 })}
              />
            </SettingRow>
            <SettingRow label="Network view" hint="Network streaming view distance in metres.">
              <TextInput
                type="number"
                value={config.game.gameProperties?.networkViewDistance ?? 1500}
                onChange={(v) => patchGameProperties({ networkViewDistance: Number(v) || 1500 })}
              />
            </SettingRow>
            <SettingRow label="Min grass distance" hint="Minimum grass render distance in metres.">
              <TextInput
                type="number"
                value={config.game.gameProperties?.serverMinGrassDistance ?? 50}
                onChange={(v) => patchGameProperties({ serverMinGrassDistance: Number(v) || 50 })}
              />
            </SettingRow>
            <SettingRow label="Fast validation" hint="Keep enabled for public internet servers (recommended).">
              <Switch
                checked={config.game.gameProperties?.fastValidation ?? true}
                onCheckedChange={(fastValidation) => patchGameProperties({ fastValidation })}
              />
            </SettingRow>
            <SettingRow label="Join queue size" hint="Max players waiting in queue (0 = disabled).">
              <TextInput
                type="number"
                value={config.operating?.joinQueue?.maxSize ?? 0}
                onChange={(v) => patchJoinQueue(Number(v) || 0)}
              />
            </SettingRow>
            <SettingRow label="Slot reservation (s)" hint="Seconds a reserved slot is held before release.">
              <TextInput
                type="number"
                value={config.operating?.slotReservationTimeout ?? 60}
                onChange={(v) => patchOperating({ slotReservationTimeout: Number(v) || 60 })}
              />
            </SettingRow>
            <SettingRow label="AI limit" hint="Max AI entities (-1 = unlimited).">
              <TextInput
                type="number"
                value={config.operating?.aiLimit ?? -1}
                onChange={(v) => patchOperating({ aiLimit: Number(v) })}
              />
            </SettingRow>
            <SettingRow label="Disable AI" hint="Turn off all AI on the server.">
              <Switch
                checked={config.operating?.disableAI ?? false}
                onCheckedChange={(disableAI) => patchOperating({ disableAI })}
              />
            </SettingRow>
            <GroupLabel>VON</GroupLabel>
            <SettingRow label="Disable VON UI" hint="Hide voice-over-net UI elements.">
              <Switch
                checked={config.game.gameProperties?.VONDisableUI ?? false}
                onCheckedChange={(VONDisableUI) => patchGameProperties({ VONDisableUI })}
              />
            </SettingRow>
            <SettingRow label="Disable direct speech UI" hint="Hide direct speech indicator UI.">
              <Switch
                checked={config.game.gameProperties?.VONDisableDirectSpeechUI ?? false}
                onCheckedChange={(VONDisableDirectSpeechUI) => patchGameProperties({ VONDisableDirectSpeechUI })}
              />
            </SettingRow>
            <SettingRow label="Cross-faction VON" hint="Allow transmitting VON across factions.">
              <Switch
                checked={config.game.gameProperties?.VONCanTransmitCrossFaction ?? false}
                onCheckedChange={(VONCanTransmitCrossFaction) => patchGameProperties({ VONCanTransmitCrossFaction })}
              />
            </SettingRow>
          </div>
        </details>
      </div>

      <div className="flex min-h-[520px] flex-col border-t border-border xl:border-t-0 xl:border-l">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
          <div>
            <p className="font-mono text-[11px] text-muted-foreground">config.json</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {jsonEditing
                ? "Full config file — invalid JSON will be rejected on save."
                : "Live preview of config.json from the form."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setJsonMode(!jsonEditing)}
            className={cn(
              "border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide transition-colors",
              jsonEditing
                ? "border-foreground/30 bg-foreground/10 text-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {jsonEditing ? "Use form" : "Edit JSON"}
          </button>
        </div>

        {jsonError && (
          <div className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive sm:px-5">
            {jsonError}
          </div>
        )}

        <textarea
          value={configRaw}
          readOnly={!jsonEditing}
          onChange={(e) => {
            setJsonError("");
            onConfigRawChange(e.target.value);
          }}
          spellCheck={false}
          className={cn(
            "min-h-0 flex-1 resize-none border-0 bg-[#141820] px-4 py-4 font-mono text-[11px] leading-6 text-[#c5cad4] outline-none sm:px-5",
            !jsonEditing && "cursor-default opacity-90",
          )}
        />
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ModEntry } from "@/lib/shared/config-schema";
import type { InstanceTemplateMeta } from "@/lib/shared/types";
import { Shell, Card, Button, Input, TextArea, api, ApiError, LinkButton } from "@/components/Shell";
import { cn } from "@/lib/utils";

interface Scenario {
  id: string;
  name: string;
  source: string;
}

interface Mission {
  slug: string;
  title: string;
  scenarioId: string;
  requiredMods: ModEntry[];
}

type ScenarioSource = "official" | "library" | "custom" | "template";

const selectClass =
  "w-full border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-foreground/30";

export default function NewInstancePage() {
  const router = useRouter();
  const [name, setName] = useState("My Reforger Server");
  const [branch, setBranch] = useState("stable");
  const [scenarioSource, setScenarioSource] = useState<ScenarioSource>("official");
  const [officialScenarioId, setOfficialScenarioId] = useState("{ECC61978EDCC2B5A}Missions/23_Campaign.conf");
  const [customScenarioId, setCustomScenarioId] = useState("");
  const [customModsJson, setCustomModsJson] = useState("[]");
  const [selectedMission, setSelectedMission] = useState("");
  const [autoPort, setAutoPort] = useState(true);
  const [publicPort, setPublicPort] = useState("");
  const [publicAddress, setPublicAddress] = useState("");
  const [usedPorts, setUsedPorts] = useState<number[]>([]);
  const [suggestedPort, setSuggestedPort] = useState<number | null>(null);
  const [crossPlatform, setCrossPlatform] = useState(false);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [templates, setTemplates] = useState<InstanceTemplateMeta[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void api<Scenario[]>(`scenarios?branch=${branch}`)
      .then((list) => {
        setScenarios(list);
        if (list.length) {
          setOfficialScenarioId((current) => (list.some((s) => s.id === current) ? current : list[0].id));
        }
      })
      .catch(() => undefined);
  }, [branch]);

  useEffect(() => {
    void api<Mission[]>("missions").then(setMissions).catch(() => undefined);
    void api<InstanceTemplateMeta[]>("templates").then(setTemplates).catch(() => undefined);
    void api<{ ips: string[]; usedPorts?: number[]; suggestedPort?: number }>("host")
      .then((h) => {
        setPublicAddress(h.ips[0] ?? "");
        setUsedPorts(h.usedPorts ?? []);
        setSuggestedPort(h.suggestedPort ?? null);
        if (h.suggestedPort) setPublicPort(String(h.suggestedPort));
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (scenarioSource === "library" && missions.length && !selectedMission) {
      setSelectedMission(missions[0].slug);
    }
  }, [missions, scenarioSource, selectedMission]);

  useEffect(() => {
    if (scenarioSource === "template" && templates.length && !selectedTemplate) {
      setSelectedTemplate(templates[0].slug);
    }
  }, [templates, scenarioSource, selectedTemplate]);

  const selectedLibraryMission = useMemo(
    () => missions.find((m) => m.slug === selectedMission) ?? null,
    [missions, selectedMission],
  );

  function parseCustomMods(): ModEntry[] {
    if (!customModsJson.trim()) return [];
    const parsed = JSON.parse(customModsJson) as ModEntry[];
    if (!Array.isArray(parsed)) throw new Error("Required mods must be a JSON array");
    return parsed;
  }

  function resolveCreatePayload() {
    if (scenarioSource === "official") {
      return { scenarioId: officialScenarioId, mods: [] as ModEntry[] };
    }
    if (scenarioSource === "library") {
      if (!selectedLibraryMission) throw new Error("Select a mission from your library or use Custom scenario ID");
      return { scenarioId: selectedLibraryMission.scenarioId, mods: selectedLibraryMission.requiredMods ?? [] };
    }
    const scenarioId = customScenarioId.trim();
    if (!scenarioId) throw new Error("Enter a custom scenarioId (e.g. {GUID}Missions/MyMission.conf)");
    return { scenarioId, mods: parseCustomMods() };
  }

  async function create() {
    setError("");
    try {
      const port = Number(publicPort);
      if (!autoPort && (!Number.isFinite(port) || port < 1 || port > 65535)) {
        throw new Error("Enter a valid UDP port between 1 and 65535");
      }

      if (scenarioSource === "template") {
        if (!selectedTemplate) throw new Error("Select a template");
        const created = await api<{ id: string }>("instances", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            templateSlug: selectedTemplate,
            name,
            ...(autoPort ? {} : { publicPort: port }),
            publicAddress,
          }),
        });
        router.push(`/instances/${created.id}`);
        return;
      }

      const { scenarioId, mods } = resolveCreatePayload();
      const created = await api<{ id: string }>("instances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          branch,
          scenarioId,
          ...(autoPort ? {} : { publicPort: port }),
          publicAddress,
          crossPlatform,
          mods,
        }),
      });
      router.push(`/instances/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Failed to create");
    }
  }

  return (
    <Shell>
      <Card title="Create instance">
        <div className="grid gap-4 md:grid-cols-2">
          <Input label="Server name" value={name} onChange={setName} />
          <label className="block space-y-2 text-sm">
            <span className="font-mono text-[11px] uppercase text-muted-foreground">Branch</span>
            <select className={selectClass} value={branch} onChange={(e) => setBranch(e.target.value)}>
              <option value="stable">Stable (1874900)</option>
              <option value="experimental">Experimental (1890870)</option>
            </select>
          </label>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={autoPort} onChange={(e) => setAutoPort(e.target.checked)} />
              Auto-assign game port
            </label>
            {autoPort ? (
              <p className="text-xs leading-5 text-muted-foreground">
                Will use UDP{" "}
                <span className="font-mono text-foreground">{suggestedPort ?? "…"}</span>
                {usedPorts.length > 0 && (
                  <>
                    {" "}
                    — in use:{" "}
                    <span className="font-mono text-foreground">{usedPorts.sort((a, b) => a - b).join(", ")}</span>
                  </>
                )}
              </p>
            ) : (
              <>
                <Input label="Public port (UDP)" value={publicPort} onChange={setPublicPort} />
                {usedPorts.includes(Number(publicPort)) && (
                  <p className="text-xs text-[#d4a574]">Port {publicPort} is already used by another instance.</p>
                )}
              </>
            )}
          </div>
          <Input label="Public address" value={publicAddress} onChange={setPublicAddress} placeholder="VPS public IP" />

          <div className="space-y-3 md:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-[11px] uppercase text-muted-foreground">Mission / scenario</span>
              <Link href="/missions" className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                Manage mission library
              </Link>
            </div>

            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["official", "Official"],
                  ["library", "From library"],
                  ["template", "From template"],
                  ["custom", "Custom ID"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setScenarioSource(value)}
                  className={cn(
                    "border px-3 py-1.5 text-xs transition-colors",
                    scenarioSource === value
                      ? "border-foreground bg-secondary text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {scenarioSource === "official" && (
              <label className="block space-y-2">
                <select
                  className={selectClass}
                  value={officialScenarioId}
                  onChange={(e) => setOfficialScenarioId(e.target.value)}
                >
                  {scenarios.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.source})
                    </option>
                  ))}
                </select>
                <p className="truncate font-mono text-[10px] text-muted-foreground">{officialScenarioId}</p>
              </label>
            )}

            {scenarioSource === "library" && (
              <div className="space-y-2">
                {missions.length > 0 ? (
                  <>
                    <select
                      className={selectClass}
                      value={selectedMission}
                      onChange={(e) => setSelectedMission(e.target.value)}
                    >
                      {missions.map((m) => (
                        <option key={m.slug} value={m.slug}>
                          {m.title}
                        </option>
                      ))}
                    </select>
                    {selectedLibraryMission && (
                      <>
                        <p className="truncate font-mono text-[10px] text-muted-foreground">
                          {selectedLibraryMission.scenarioId}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Includes {selectedLibraryMission.requiredMods?.length ?? 0} mod
                          {(selectedLibraryMission.requiredMods?.length ?? 0) === 1 ? "" : "s"} — download them after
                          create.
                        </p>
                      </>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No missions registered yet. Use <strong className="font-medium text-foreground">Custom ID</strong> below
                    or{" "}
                    <Link href="/missions" className="underline-offset-2 hover:underline">
                      add one to the library
                    </Link>
                    .
                  </p>
                )}
              </div>
            )}

            {scenarioSource === "template" && (
              <div className="space-y-2">
                {templates.length > 0 ? (
                  <>
                    <select
                      className={selectClass}
                      value={selectedTemplate}
                      onChange={(e) => setSelectedTemplate(e.target.value)}
                    >
                      {templates.map((template) => (
                        <option key={template.slug} value={template.slug}>
                          {template.title} ({template.branch})
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-muted-foreground">
                      Templates save config and alert defaults — download mods after create if needed.
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No templates yet. Save one from an instance under Admin → Clone.
                  </p>
                )}
              </div>
            )}

            {scenarioSource === "custom" && (
              <div className="space-y-3">
                <Input
                  label="scenarioId"
                  value={customScenarioId}
                  onChange={setCustomScenarioId}
                  placeholder="{7EEC5B26FFB0DFC3}Missions/BlackMountainsConflict.conf"
                />
                <TextArea
                  label="Required mods (JSON)"
                  value={customModsJson}
                  onChange={setCustomModsJson}
                  rows={6}
                />
                <p className="text-xs leading-5 text-muted-foreground">
                  Paste the full scenario path from the mod. Each dependency needs a{" "}
                  <span className="font-mono text-[10px]">modId</span> (Reforger workshop GUID).
                </p>
                <pre className="overflow-x-auto bg-[#141820] p-3 font-mono text-[10px] leading-5 text-[#c5cad4]">
                  {`[{"modId":"6960D8D8749B438C","name":"Black Mountains","required":true}]`}
                </pre>
              </div>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm md:col-span-2">
            <input type="checkbox" checked={crossPlatform} onChange={(e) => setCrossPlatform(e.target.checked)} />
            Enable crossplay (PC + consoles)
          </label>
        </div>

        {error && <p className="border-t border-border px-4 py-3 text-sm text-destructive">{error}</p>}

        <div className="flex flex-wrap gap-2 border-t border-border px-4 py-4">
          <Button onClick={() => void create()}>Create instance</Button>
          <LinkButton href="/">Cancel</LinkButton>
        </div>
      </Card>
    </Shell>
  );
}

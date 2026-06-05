"use client";

import { useState } from "react";
import { Shell, Card, Button, Input, TextArea, api, ApiError } from "@/components/Shell";
import { PageContentSkeleton } from "@/components/page-content-skeleton";
import { usePanelData } from "@/hooks/use-panel-data";
import type { WorkshopAssetSummary } from "@/lib/shared/workshop-catalog";
import { slugifyWorkshopName } from "@/lib/shared/workshop-catalog";

interface Mission {
  slug: string;
  title: string;
  scenarioId: string;
  source: string;
  requiredMods: { modId: string; name?: string }[];
}

export default function MissionsPage() {
  const { data: missions, loading, reload } = usePanelData<Mission[]>("missions");
  const missionList = missions ?? [];
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [scenarioId, setScenarioId] = useState("");
  const [modsJson, setModsJson] = useState("[]");
  const [confContent, setConfContent] = useState("");
  const [message, setMessage] = useState("");

  const [workshopUrl, setWorkshopUrl] = useState("");
  const [workshop, setWorkshop] = useState<WorkshopAssetSummary | null>(null);
  const [workshopLoading, setWorkshopLoading] = useState(false);

  async function lookupWorkshop() {
    setWorkshopLoading(true);
    setMessage("");
    try {
      const result = await api<WorkshopAssetSummary>(
        `workshop/lookup?url=${encodeURIComponent(workshopUrl.trim())}`,
      );
      setWorkshop(result);
    } catch (err) {
      setWorkshop(null);
      setMessage(err instanceof ApiError ? err.message : "Workshop lookup failed");
    } finally {
      setWorkshopLoading(false);
    }
  }

  function applyScenario(scenarioIndex: number) {
    if (!workshop) return;
    const scenario = workshop.scenarios[scenarioIndex];
    if (!scenario) return;

    const baseSlug = slugifyWorkshopName(scenario.name || workshop.name);
    setSlug(baseSlug);
    setTitle(scenario.name || workshop.name);
    setScenarioId(scenario.scenarioId);
    setModsJson(JSON.stringify(workshop.mods, null, 2));
    setMessage(`Loaded "${scenario.name}" with ${workshop.mods.length} mod(s) including dependencies`);
  }

  async function registerFromWorkshop(scenarioIndex: number) {
    if (!workshop) return;
    applyScenario(scenarioIndex);
    const scenario = workshop.scenarios[scenarioIndex];
    if (!scenario) return;

    const missionSlug = slugifyWorkshopName(scenario.name || workshop.name);
    await api("missions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: missionSlug,
        title: scenario.name || workshop.name,
        scenarioId: scenario.scenarioId,
        source: "Workshop",
        requiredMods: workshop.mods,
      }),
    });
    setMessage(`Registered workshop mission "${scenario.name}"`);
    await reload();
  }

  async function register() {
    const requiredMods = JSON.parse(modsJson) as { modId: string; name?: string }[];
    const files: Record<string, string> = {};
    if (confContent.trim()) {
      files[`${slug}.conf`] = btoa(unescape(encodeURIComponent(confContent)));
    }
    await api("missions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, title, scenarioId, requiredMods, files }),
    });
    setMessage("Mission registered");
    await reload();
  }

  async function remove(slugToRemove: string) {
    await api(`missions/${slugToRemove}`, { method: "DELETE" });
    await reload();
  }

  if (loading && missions === undefined) {
    return (
      <Shell header={{ title: "Missions", meta: "Workshop import and custom mission library" }}>
        <PageContentSkeleton />
      </Shell>
    );
  }

  return (
    <Shell header={{ title: "Missions", meta: "Workshop import and custom mission library" }}>
      {message && <p className="mb-4 text-emerald-400">{message}</p>}

      <Card title="Import from Reforger Workshop" className="mb-6">
        <div className="grid gap-3">
          <Input
            label="Workshop URL or mod ID"
            value={workshopUrl}
            onChange={setWorkshopUrl}
            placeholder="https://reforger.armaplatform.com/workshop/697B455248A8F0EB-OG_Karnova"
          />
          <div className="flex flex-wrap gap-2">
            <Button disabled={workshopLoading || !workshopUrl.trim()} onClick={() => void lookupWorkshop()}>
              {workshopLoading ? "Looking up…" : "Fetch mod + dependencies"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Reads scenarios and the full dependency chain from reforger.armaplatform.com — same data as the workshop
            dependencies page.
          </p>

          {workshop && (
            <div className="space-y-4 border border-border bg-background/40 p-3">
              <div>
                <p className="font-medium text-foreground">{workshop.name}</p>
                <p className="text-xs text-muted-foreground">
                  {workshop.id} · {workshop.author || "Unknown author"} · v{workshop.version || "?"}
                </p>
                {workshop.summary && <p className="mt-2 text-sm text-muted-foreground">{workshop.summary}</p>}
              </div>

              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Dependencies ({workshop.mods.length})
                </p>
                <ul className="max-h-40 space-y-1 overflow-auto text-xs">
                  {workshop.mods.map((mod) => (
                    <li key={mod.modId} className="font-mono text-foreground/90">
                      {mod.name ?? "Unnamed"} · {mod.modId}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Scenarios</p>
                {!workshop.scenarios.length && (
                  <p className="text-sm text-muted-foreground">No scenarios listed on this workshop item.</p>
                )}
                <div className="space-y-2">
                  {workshop.scenarios.map((scenario, index) => (
                    <div key={scenario.scenarioId} className="flex flex-wrap items-start justify-between gap-3 border border-border p-3">
                      <div className="min-w-0">
                        <p className="font-medium">{scenario.name}</p>
                        <p className="truncate font-mono text-xs text-muted-foreground">{scenario.scenarioId}</p>
                        <p className="text-xs text-muted-foreground">
                          {scenario.gameMode || "Unknown mode"} · {scenario.playerCount || "?"} players
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="ghost" onClick={() => applyScenario(index)}>
                          Fill form
                        </Button>
                        <Button onClick={() => void registerFromWorkshop(index)}>Save to library</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Register custom mission">
          <div className="grid gap-3">
            <Input label="Slug" value={slug} onChange={setSlug} placeholder="my-operation" />
            <Input label="Title" value={title} onChange={setTitle} />
            <Input label="scenarioId" value={scenarioId} onChange={setScenarioId} placeholder="{GUID}Missions/MyMission.conf" />
            <TextArea label="Required mods JSON" value={modsJson} onChange={setModsJson} rows={8} />
            <TextArea label="Optional .conf file contents" value={confContent} onChange={setConfContent} rows={8} />
            <Button onClick={() => void register()}>Save mission</Button>
          </div>
        </Card>

        <Card title="Mission library">
          <div className="space-y-4">
            {missionList.map((mission) => (
              <div key={mission.slug} className="rounded-md border border-zinc-800 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{mission.title}</p>
                    <p className="text-xs text-zinc-400">{mission.scenarioId}</p>
                    <p className="text-xs text-zinc-500">Source: {mission.source}</p>
                    <p className="mt-1 text-xs">Mods: {mission.requiredMods?.length ?? 0}</p>
                  </div>
                  <Button variant="danger" onClick={() => void remove(mission.slug)}>
                    Delete
                  </Button>
                </div>
              </div>
            ))}
            {!missionList.length && <p className="text-sm text-zinc-400">No custom missions yet.</p>}
          </div>
        </Card>
      </div>
    </Shell>
  );
}

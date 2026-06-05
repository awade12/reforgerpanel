import { HttpError } from "../lib/shared/http-error";
import type { ModEntry } from "../lib/shared/config-schema";
import {
  formatWorkshopModId,
  parseWorkshopAssetId,
  type WorkshopAssetSummary,
  type WorkshopScenario,
} from "../lib/shared/workshop-catalog";

const WORKSHOP_ORIGIN = "https://reforger.armaplatform.com";
const MAX_FETCHES = 24;

type RawWorkshopAsset = {
  id: string;
  name: string;
  summary?: string;
  currentVersionNumber?: string;
  gameVersion?: string;
  author?: { name?: string };
  scenarios?: {
    name: string;
    gameId: string;
    gameMode?: string;
    playerCount?: number;
    description?: string;
  }[];
  dependencies?: {
    version?: string;
    asset: { id: string; name: string };
  }[];
};

const cache = new Map<string, RawWorkshopAsset>();

function workshopPageUrl(assetId: string) {
  return `${WORKSHOP_ORIGIN}/workshop/${assetId}`;
}

function extractNextData(html: string) {
  const match = html.match(/__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s);
  if (!match) throw new HttpError(502, "Workshop page did not return expected data");
  try {
    return JSON.parse(match[1]) as { props?: { pageProps?: { asset?: RawWorkshopAsset } } };
  } catch {
    throw new HttpError(502, "Workshop page returned invalid JSON");
  }
}

async function fetchRawWorkshopAsset(assetId: string): Promise<RawWorkshopAsset> {
  const cached = cache.get(assetId);
  if (cached) return cached;

  const res = await fetch(workshopPageUrl(assetId), {
    headers: {
      "User-Agent": "ReforgerHost/1.0 (+workshop lookup)",
      Accept: "text/html",
    },
    cache: "no-store",
  });

  if (res.status === 404) {
    throw new HttpError(404, `Workshop item not found: ${assetId}`);
  }
  if (!res.ok) {
    throw new HttpError(502, `Workshop returned HTTP ${res.status}`);
  }

  const html = await res.text();
  const data = extractNextData(html);
  const asset = data.props?.pageProps?.asset;
  if (!asset?.id) {
    throw new HttpError(404, `Workshop item not found: ${assetId}`);
  }

  cache.set(assetId, asset);
  return asset;
}

function mapScenarios(asset: RawWorkshopAsset): WorkshopScenario[] {
  return (asset.scenarios ?? []).map((scenario) => ({
    name: scenario.name,
    scenarioId: scenario.gameId,
    gameMode: scenario.gameMode ?? "",
    playerCount: scenario.playerCount ?? 0,
    description: scenario.description ?? "",
  }));
}

async function collectMods(assetId: string, visited: Set<string>, budget: { left: number }): Promise<ModEntry[]> {
  if (visited.has(assetId) || budget.left <= 0) return [];
  visited.add(assetId);
  budget.left -= 1;

  const asset = await fetchRawWorkshopAsset(assetId);
  const mods: ModEntry[] = [
    {
      modId: formatWorkshopModId(asset.id),
      name: asset.name,
      version: asset.currentVersionNumber ?? "",
      required: true,
    },
  ];

  for (const dep of asset.dependencies ?? []) {
    const depId = dep.asset.id.toUpperCase();
    const nested = await collectMods(depId, visited, budget);
    for (const mod of nested) {
      if (!mods.some((existing) => existing.modId === mod.modId)) {
        mods.push({
          ...mod,
          version: mod.version || dep.version || "",
        });
      }
    }
  }

  return mods;
}

export async function lookupWorkshopAsset(assetId: string): Promise<WorkshopAssetSummary> {
  cache.clear();
  const root = await fetchRawWorkshopAsset(assetId);
  const mods = await collectMods(assetId, new Set(), { left: MAX_FETCHES });

  return {
    id: root.id.toUpperCase(),
    name: root.name,
    author: root.author?.name ?? "",
    summary: root.summary ?? "",
    version: root.currentVersionNumber ?? "",
    gameVersion: root.gameVersion ?? "",
    scenarios: mapScenarios(root),
    mods,
  };
}

export async function lookupWorkshopInput(input: string) {
  const assetId = parseWorkshopAssetId(input);
  if (!assetId) {
    throw new HttpError(400, "Paste a Reforger workshop URL or 16-character mod ID");
  }
  return lookupWorkshopAsset(assetId);
}

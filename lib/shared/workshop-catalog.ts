import type { ModEntry } from "./config-schema";

export type WorkshopScenario = {
  name: string;
  scenarioId: string;
  gameMode: string;
  playerCount: number;
  description: string;
};

export type WorkshopAssetSummary = {
  id: string;
  name: string;
  author: string;
  summary: string;
  version: string;
  gameVersion: string;
  scenarios: WorkshopScenario[];
  mods: ModEntry[];
};

const ASSET_ID_RE = /([0-9A-Fa-f]{16})/;

export function parseWorkshopAssetId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const urlMatch = trimmed.match(/\/workshop\/([0-9A-Fa-f]{16})/i);
  if (urlMatch) return urlMatch[1].toUpperCase();

  const direct = trimmed.match(/^([0-9A-Fa-f]{16})$/);
  if (direct) return direct[1].toUpperCase();

  const embedded = trimmed.match(ASSET_ID_RE);
  return embedded ? embedded[1].toUpperCase() : null;
}

export function normalizeAddonModId(modId: string) {
  const hex = modId.replace(/[{}]/g, "").trim().toUpperCase();
  if (/^[0-9A-F]{16}$/.test(hex)) return hex;
  return modId.trim();
}

export function formatWorkshopModId(assetId: string) {
  return normalizeAddonModId(assetId);
}

export function slugifyWorkshopName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

import fs from "fs";
import path from "path";
import { parseServerConfig } from "../lib/shared/config-schema";
import { HttpError } from "../lib/shared/http-error";
import type { Branch, InstanceTemplateMeta } from "../lib/shared/types";
import { mergeInstanceAlerts } from "../lib/shared/alerts";
import { agentConfig } from "./config";
import { addAudit } from "./db";
import {
  createInstance,
  getInstanceDetailed,
  readInstanceConfig,
  updateInstanceSettings,
  writeInstanceConfig,
} from "./instances";

function templatesRoot() {
  return path.join(agentConfig.dataDir, "templates");
}

function templateDir(slug: string) {
  return path.join(templatesRoot(), slug);
}

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

function uniqueTemplateSlug(name: string) {
  let slug = slugify(name) || "template";
  const base = slug;
  let n = 2;
  while (fs.existsSync(templateDir(slug))) {
    slug = `${base}-${n}`.slice(0, 40);
    n += 1;
  }
  return slug;
}

function readTemplateMeta(slug: string): InstanceTemplateMeta | null {
  const metaPath = path.join(templateDir(slug), "meta.json");
  if (!fs.existsSync(metaPath)) return null;
  return JSON.parse(fs.readFileSync(metaPath, "utf8")) as InstanceTemplateMeta;
}

export function listInstanceTemplates(): InstanceTemplateMeta[] {
  const root = templatesRoot();
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root)
    .map((slug) => readTemplateMeta(slug))
    .filter((item): item is InstanceTemplateMeta => item != null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getInstanceTemplate(slug: string) {
  const meta = readTemplateMeta(slug);
  if (!meta) throw new HttpError(404, "Template not found");
  const configPath = path.join(templateDir(slug), "config.json");
  const settingsPath = path.join(templateDir(slug), "settings.json");
  if (!fs.existsSync(configPath)) throw new HttpError(404, "Template config missing");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const settings = fs.existsSync(settingsPath)
    ? JSON.parse(fs.readFileSync(settingsPath, "utf8"))
    : null;
  return { meta, config, settings };
}

export function saveInstanceTemplate(
  instanceId: string,
  input: { title: string; description?: string; slug?: string },
) {
  const instance = getInstanceDetailed(instanceId);
  if (!instance) throw new HttpError(404, "Instance not found");

  if (!input.title.trim()) throw new HttpError(400, "Template title is required");

  const slug = input.slug?.trim() ? slugify(input.slug) : uniqueTemplateSlug(input.title);
  if (!slug) throw new HttpError(400, "Template slug is required");
  if (fs.existsSync(templateDir(slug))) {
    throw new HttpError(409, "A template with this slug already exists");
  }

  const dir = templateDir(slug);
  fs.mkdirSync(dir, { recursive: true });

  const config = readInstanceConfig(instance);
  const meta: InstanceTemplateMeta = {
    slug,
    title: input.title.trim() || instance.name,
    description: input.description?.trim() ?? "",
    branch: instance.branch,
    createdAt: new Date().toISOString(),
    sourceInstanceName: instance.name,
  };

  fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify(meta, null, 2));
  fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify(config, null, 2));
  fs.writeFileSync(
    path.join(dir, "settings.json"),
    JSON.stringify(
      {
        autoRestart: instance.autoRestart,
        maxFps: instance.maxFps,
        logStatsMs: instance.logStatsMs,
        logLevel: instance.logLevel,
        alerts: instance.alerts,
      },
      null,
      2,
    ),
  );

  addAudit("template.create", `${slug} from ${instance.slug}`);
  return meta;
}

export function deleteInstanceTemplate(slug: string) {
  const meta = readTemplateMeta(slug);
  if (!meta) throw new HttpError(404, "Template not found");
  fs.rmSync(templateDir(slug), { recursive: true, force: true });
  addAudit("template.delete", slug);
  return { ok: true };
}

export function createInstanceFromTemplate(
  templateSlug: string,
  input: { name: string; publicPort?: number; publicAddress?: string },
) {
  const template = getInstanceTemplate(templateSlug);
  const config = parseServerConfig(template.config);
  const settings = template.settings as
    | {
        autoRestart?: boolean;
        maxFps?: number;
        logStatsMs?: number | null;
        logLevel?: string | null;
        alerts?: Partial<InstanceAlertSettings>;
      }
    | null;

  const created = createInstance({
    name: input.name.trim() || template.meta.title,
    branch: template.meta.branch as Branch,
    scenarioId: config.game.scenarioId,
    publicPort: input.publicPort,
    publicAddress: input.publicAddress ?? config.publicAddress,
    maxPlayers: config.game.maxPlayers,
    crossPlatform: Boolean(config.game.crossPlatform),
    mods: config.game.mods,
  });

  writeInstanceConfig(created, {
    ...config,
    name: input.name.trim() || template.meta.title,
    publicPort: created.config.publicPort,
  });

  if (settings) {
    updateInstanceSettings(created.id, {
      autoRestart: settings.autoRestart,
      maxFps: settings.maxFps,
      logStatsMs: settings.logStatsMs,
      logLevel: settings.logLevel,
      alerts: settings.alerts ? mergeInstanceAlerts(settings.alerts) : undefined,
    });
  }

  addAudit("instance.create.template", `${created.slug} from ${templateSlug}`);
  return getInstanceDetailed(created.id)!;
}

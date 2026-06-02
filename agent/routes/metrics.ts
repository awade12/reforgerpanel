import type { MetricsResolution, MetricsTimeRange } from "../../lib/shared/types";
import { getInstance } from "../db";
import {
  countHostSamplesInRange,
  countInstanceSamplesInRange,
  metricsEnabled,
  queryAllLatestInstanceMetrics,
  queryHostMetrics,
  queryInstanceEvents,
  queryInstanceMetrics,
  queryInstancesOverview,
  queryLatestHostMetric,
  queryLatestInstanceMetrics,
  queryMetricsSummary,
} from "../db/metrics";
import { sendJson, type RequestContext } from "../http";

const VALID_RESOLUTIONS = new Set<MetricsResolution>(["raw", "1m", "5m", "1h"]);
const VALID_RANGES = new Set<MetricsTimeRange>(["1h", "6h", "24h", "7d", "30d"]);

function parseRange(value: string | null): MetricsTimeRange {
  if (value && VALID_RANGES.has(value as MetricsTimeRange)) return value as MetricsTimeRange;
  return "24h";
}

function parseResolution(value: string | null, range: MetricsTimeRange): MetricsResolution {
  if (value && VALID_RESOLUTIONS.has(value as MetricsResolution)) return value as MetricsResolution;
  if (range === "1h" || range === "6h") return "1m";
  if (range === "24h") return "5m";
  return "1h";
}

function rangeToMs(range: MetricsTimeRange) {
  if (range === "1h") return 3_600_000;
  if (range === "6h") return 6 * 3_600_000;
  if (range === "24h") return 24 * 3_600_000;
  if (range === "7d") return 7 * 24 * 3_600_000;
  return 30 * 24 * 3_600_000;
}

function parseWindow(url: URL) {
  const range = parseRange(url.searchParams.get("range"));
  const resolution = parseResolution(url.searchParams.get("resolution"), range);
  const toParam = url.searchParams.get("to");
  const fromParam = url.searchParams.get("from");
  const to = toParam ? new Date(toParam) : new Date();
  const from = fromParam ? new Date(fromParam) : new Date(to.getTime() - rangeToMs(range));
  return {
    range,
    resolution,
    from: from.toISOString(),
    to: to.toISOString(),
  };
}

export async function handleMetricsRoutes(ctx: RequestContext): Promise<boolean> {
  const { pathname, method, url } = ctx;

  if (pathname === "/metrics/status" && method === "GET") {
    sendJson(ctx.res, 200, await queryMetricsSummary());
    return true;
  }

  if (pathname === "/metrics/host" && method === "GET") {
    if (!metricsEnabled()) {
      sendJson(ctx.res, 200, { enabled: false, samples: [], latest: null, rawSampleCount: 0, ...parseWindow(url) });
      return true;
    }
    const window = parseWindow(url);
    const [samples, latest, rawSampleCount] = await Promise.all([
      queryHostMetrics(window.from, window.to, window.resolution),
      queryLatestHostMetric(),
      countHostSamplesInRange(window.from, window.to),
    ]);
    sendJson(ctx.res, 200, { enabled: true, latest, samples, rawSampleCount, ...window });
    return true;
  }

  if (pathname === "/metrics/instances/overview" && method === "GET") {
    if (!metricsEnabled()) {
      sendJson(ctx.res, 200, { enabled: false, instances: [], ...parseWindow(url) });
      return true;
    }
    const window = parseWindow(url);
    const instances = await queryInstancesOverview(window.from, window.to);
    sendJson(ctx.res, 200, { enabled: true, instances, ...window });
    return true;
  }

  if (pathname === "/metrics/instances/latest" && method === "GET") {
    if (!metricsEnabled()) {
      sendJson(ctx.res, 200, { enabled: false, samples: [] });
      return true;
    }
    sendJson(ctx.res, 200, { enabled: true, samples: await queryAllLatestInstanceMetrics() });
    return true;
  }

  const instanceMatch = pathname.match(/^\/instances\/([^/]+)\/metrics(\/.*)?$/);
  if (instanceMatch) {
    const instanceId = instanceMatch[1];
    const sub = instanceMatch[2] ?? "";

    if (!getInstance(instanceId)) {
      sendJson(ctx.res, 404, { error: "Not found" });
      return true;
    }

    if (sub === "/latest" && method === "GET") {
      if (!metricsEnabled()) {
        sendJson(ctx.res, 200, { enabled: false, sample: null });
        return true;
      }
      sendJson(ctx.res, 200, { enabled: true, sample: await queryLatestInstanceMetrics(instanceId) });
      return true;
    }

    if (sub === "/events" && method === "GET") {
      if (!metricsEnabled()) {
        sendJson(ctx.res, 200, { enabled: false, events: [] });
        return true;
      }
      const window = parseWindow(url);
      const events = await queryInstanceEvents(instanceId, window.from, window.to);
      sendJson(ctx.res, 200, { enabled: true, events, ...window });
      return true;
    }

    if (sub === "" && method === "GET") {
      if (!metricsEnabled()) {
        sendJson(ctx.res, 200, { enabled: false, samples: [], latest: null, rawSampleCount: 0, ...parseWindow(url) });
        return true;
      }
      const window = parseWindow(url);
      const [samples, latest, rawSampleCount] = await Promise.all([
        queryInstanceMetrics(instanceId, window.from, window.to, window.resolution),
        queryLatestInstanceMetrics(instanceId),
        countInstanceSamplesInRange(instanceId, window.from, window.to),
      ]);
      sendJson(ctx.res, 200, { enabled: true, latest, samples, rawSampleCount, ...window });
      return true;
    }
  }

  return false;
}

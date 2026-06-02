import type {
  HostMetricSample,
  InstanceMetricEvent,
  InstanceMetricsOverviewItem,
  InstanceMetricSample,
  InstanceMetricsSparkPoint,
  MetricsResolution,
} from "../../lib/shared/types";
import { getPool, usePostgres } from "./postgres";

const RETENTION_DAYS = 30;

export function metricsEnabled() {
  return usePostgres();
}

function rowToHostSample(row: Record<string, unknown>): HostMetricSample {
  return {
    at: new Date(String(row.sampled_at)).toISOString(),
    cpuPercent: row.cpu_percent == null ? null : Number(row.cpu_percent),
    memoryPercent: row.memory_percent == null ? null : Number(row.memory_percent),
    memoryUsedMb: row.memory_used_mb == null ? null : Number(row.memory_used_mb),
    memoryTotalMb: row.memory_total_mb == null ? null : Number(row.memory_total_mb),
    load1: row.load1 == null ? null : Number(row.load1),
    load5: row.load5 == null ? null : Number(row.load5),
    load15: row.load15 == null ? null : Number(row.load15),
    diskFreeGb: row.disk_free_gb == null ? null : Number(row.disk_free_gb),
    diskUsedPercent: row.disk_used_percent == null ? null : Number(row.disk_used_percent),
    playersOnline: row.players_online == null ? null : Number(row.players_online),
    instancesRunning: row.instances_running == null ? null : Number(row.instances_running),
    instancesTotal: row.instances_total == null ? null : Number(row.instances_total),
    instanceRamMb: row.instance_ram_mb == null ? null : Number(row.instance_ram_mb),
    ingressMbps: row.ingress_mbps == null ? null : Number(row.ingress_mbps),
    egressMbps: row.egress_mbps == null ? null : Number(row.egress_mbps),
    networkIface: row.network_iface == null ? null : String(row.network_iface),
  };
}

function rowToInstanceSample(row: Record<string, unknown>): InstanceMetricSample {
  return {
    at: new Date(String(row.sampled_at)).toISOString(),
    instanceId: String(row.instance_id),
    status: String(row.status),
    fps: row.fps == null ? null : Number(row.fps),
    memoryMb: row.memory_mb == null ? null : Number(row.memory_mb),
    cpuPercent: row.cpu_percent == null ? null : Number(row.cpu_percent),
    playerCount: row.player_count == null ? null : Number(row.player_count),
    maxPlayers: row.max_players == null ? null : Number(row.max_players),
    a2sListed: row.a2s_listed == null ? null : Boolean(row.a2s_listed),
    a2sLatencyMs: row.a2s_latency_ms == null ? null : Number(row.a2s_latency_ms),
    diskProfileMb: row.disk_profile_mb == null ? null : Number(row.disk_profile_mb),
    systemdActive: row.systemd_active == null ? null : Boolean(row.systemd_active),
    uptimeSec: row.uptime_sec == null ? null : Number(row.uptime_sec),
    hostLoad1: row.host_load1 == null ? null : Number(row.host_load1),
    hostMemoryPercent: row.host_memory_percent == null ? null : Number(row.host_memory_percent),
  };
}

function rowToEvent(row: Record<string, unknown>): InstanceMetricEvent {
  return {
    id: Number(row.id),
    at: new Date(String(row.at)).toISOString(),
    instanceId: String(row.instance_id),
    kind: String(row.kind),
    payload: typeof row.payload === "string" ? JSON.parse(row.payload) : (row.payload as Record<string, unknown>),
  };
}

function resolutionBucket(resolution: MetricsResolution) {
  if (resolution === "1h") return "1 hour";
  if (resolution === "5m") return "5 minutes";
  if (resolution === "1m") return "1 minute";
  return null;
}

export async function insertHostSample(sample: Omit<HostMetricSample, "at"> & { at?: string }) {
  if (!metricsEnabled()) return;
  const at = sample.at ?? new Date().toISOString();
  await getPool().query(
    `INSERT INTO host_metric_samples (
      sampled_at, cpu_percent, memory_percent, memory_used_mb, memory_total_mb,
      load1, load5, load15, disk_free_gb, disk_used_percent,
      players_online, instances_running, instances_total, instance_ram_mb,
      ingress_mbps, egress_mbps, network_iface
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
    [
      at,
      sample.cpuPercent,
      sample.memoryPercent,
      sample.memoryUsedMb,
      sample.memoryTotalMb,
      sample.load1,
      sample.load5,
      sample.load15,
      sample.diskFreeGb,
      sample.diskUsedPercent,
      sample.playersOnline,
      sample.instancesRunning,
      sample.instancesTotal,
      sample.instanceRamMb,
      sample.ingressMbps,
      sample.egressMbps,
      sample.networkIface,
    ],
  );
}

export async function insertInstanceSamples(samples: InstanceMetricSample[]) {
  if (!metricsEnabled() || !samples.length) return;
  const values: unknown[] = [];
  const placeholders: string[] = [];
  let i = 1;
  for (const sample of samples) {
    placeholders.push(
      `($${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++})`,
    );
    values.push(
      sample.instanceId,
      sample.at,
      sample.status,
      sample.fps,
      sample.memoryMb,
      sample.cpuPercent,
      sample.playerCount,
      sample.maxPlayers,
      sample.a2sListed,
      sample.a2sLatencyMs,
      sample.diskProfileMb,
      sample.systemdActive,
      sample.uptimeSec,
      sample.hostLoad1,
      sample.hostMemoryPercent,
    );
  }
  await getPool().query(
    `INSERT INTO instance_metric_samples (
      instance_id, sampled_at, status, fps, memory_mb, cpu_percent,
      player_count, max_players, a2s_listed, a2s_latency_ms, disk_profile_mb,
      systemd_active, uptime_sec, host_load1, host_memory_percent
    ) VALUES ${placeholders.join(", ")}`,
    values,
  );
}

export async function insertInstanceEvent(event: Omit<InstanceMetricEvent, "id">) {
  if (!metricsEnabled()) return;
  await getPool().query(
    `INSERT INTO instance_metric_events (instance_id, at, kind, payload) VALUES ($1, $2, $3, $4::jsonb)`,
    [event.instanceId, event.at, event.kind, JSON.stringify(event.payload ?? {})],
  );
}

export async function countHostSamplesInRange(from: string, to: string) {
  if (!metricsEnabled()) return 0;
  const res = await getPool().query(
    `SELECT COUNT(*)::int AS count FROM host_metric_samples WHERE sampled_at >= $1 AND sampled_at <= $2`,
    [from, to],
  );
  return Number(res.rows[0]?.count ?? 0);
}

export async function queryHostMetrics(from: string, to: string, resolution: MetricsResolution) {
  if (!metricsEnabled()) return [] as HostMetricSample[];
  const bucket = resolutionBucket(resolution);
  if (!bucket) {
    const res = await getPool().query(
      `SELECT * FROM host_metric_samples
       WHERE sampled_at >= $1 AND sampled_at <= $2
       ORDER BY sampled_at ASC`,
      [from, to],
    );
    return res.rows.map(rowToHostSample);
  }
  const res = await getPool().query(
    `SELECT
       date_trunc('minute', sampled_at) -
         (EXTRACT(MINUTE FROM sampled_at)::int % ${resolution === "5m" ? 5 : resolution === "1h" ? 60 : 1}) * INTERVAL '1 minute' AS bucket,
       avg(cpu_percent) AS cpu_percent,
       avg(memory_percent) AS memory_percent,
       avg(memory_used_mb)::int AS memory_used_mb,
       max(memory_total_mb) AS memory_total_mb,
       avg(load1) AS load1,
       avg(load5) AS load5,
       avg(load15) AS load15,
       avg(disk_free_gb) AS disk_free_gb,
       avg(disk_used_percent) AS disk_used_percent,
       max(players_online) AS players_online,
       max(instances_running) AS instances_running,
       max(instances_total) AS instances_total,
       avg(instance_ram_mb)::int AS instance_ram_mb,
       avg(ingress_mbps) AS ingress_mbps,
       avg(egress_mbps) AS egress_mbps,
       (array_agg(network_iface ORDER BY sampled_at DESC))[1] AS network_iface
     FROM host_metric_samples
     WHERE sampled_at >= $1 AND sampled_at <= $2
     GROUP BY 1
     ORDER BY 1 ASC`,
    [from, to],
  );
  return res.rows.map((row) =>
    rowToHostSample({
      sampled_at: row.bucket,
      cpu_percent: row.cpu_percent,
      memory_percent: row.memory_percent,
      memory_used_mb: row.memory_used_mb,
      memory_total_mb: row.memory_total_mb,
      load1: row.load1,
      load5: row.load5,
      load15: row.load15,
      disk_free_gb: row.disk_free_gb,
      disk_used_percent: row.disk_used_percent,
      players_online: row.players_online,
      instances_running: row.instances_running,
      instances_total: row.instances_total,
      instance_ram_mb: row.instance_ram_mb,
      ingress_mbps: row.ingress_mbps,
      egress_mbps: row.egress_mbps,
      network_iface: row.network_iface,
    }),
  );
}

export async function countInstanceSamplesInRange(instanceId: string, from: string, to: string) {
  if (!metricsEnabled()) return 0;
  const res = await getPool().query(
    `SELECT COUNT(*)::int AS count FROM instance_metric_samples
     WHERE instance_id = $1 AND sampled_at >= $2 AND sampled_at <= $3`,
    [instanceId, from, to],
  );
  return Number(res.rows[0]?.count ?? 0);
}

export async function queryInstanceMetrics(
  instanceId: string,
  from: string,
  to: string,
  resolution: MetricsResolution,
) {
  if (!metricsEnabled()) return [] as InstanceMetricSample[];
  const bucket = resolutionBucket(resolution);
  if (!bucket) {
    const res = await getPool().query(
      `SELECT * FROM instance_metric_samples
       WHERE instance_id = $1 AND sampled_at >= $2 AND sampled_at <= $3
       ORDER BY sampled_at ASC`,
      [instanceId, from, to],
    );
    return res.rows.map(rowToInstanceSample);
  }
  const mod = resolution === "5m" ? 5 : resolution === "1h" ? 60 : 1;
  const res = await getPool().query(
    `SELECT
       date_trunc('minute', sampled_at) -
         (EXTRACT(MINUTE FROM sampled_at)::int % ${mod}) * INTERVAL '1 minute' AS bucket,
       instance_id,
       (array_agg(status ORDER BY sampled_at DESC))[1] AS status,
       avg(fps) AS fps,
       avg(memory_mb)::int AS memory_mb,
       avg(cpu_percent) AS cpu_percent,
       max(player_count) AS player_count,
       max(max_players) AS max_players,
       bool_or(a2s_listed) AS a2s_listed,
       avg(a2s_latency_ms)::int AS a2s_latency_ms,
       max(disk_profile_mb) AS disk_profile_mb,
       bool_or(systemd_active) AS systemd_active,
       max(uptime_sec) AS uptime_sec,
       avg(host_load1) AS host_load1,
       avg(host_memory_percent) AS host_memory_percent
     FROM instance_metric_samples
     WHERE instance_id = $1 AND sampled_at >= $2 AND sampled_at <= $3
     GROUP BY bucket, instance_id
     ORDER BY bucket ASC`,
    [instanceId, from, to],
  );
  return res.rows.map((row) =>
    rowToInstanceSample({
      sampled_at: row.bucket,
      instance_id: row.instance_id,
      status: row.status,
      fps: row.fps,
      memory_mb: row.memory_mb,
      cpu_percent: row.cpu_percent,
      player_count: row.player_count,
      max_players: row.max_players,
      a2s_listed: row.a2s_listed,
      a2s_latency_ms: row.a2s_latency_ms,
      disk_profile_mb: row.disk_profile_mb,
      systemd_active: row.systemd_active,
      uptime_sec: row.uptime_sec,
      host_load1: row.host_load1,
      host_memory_percent: row.host_memory_percent,
    }),
  );
}

export async function queryLatestInstanceMetrics(instanceId: string) {
  if (!metricsEnabled()) return null;
  const res = await getPool().query(
    `SELECT * FROM instance_metric_samples
     WHERE instance_id = $1
     ORDER BY sampled_at DESC
     LIMIT 1`,
    [instanceId],
  );
  return res.rows[0] ? rowToInstanceSample(res.rows[0]) : null;
}

export async function queryLatestHostMetric() {
  if (!metricsEnabled()) return null;
  const res = await getPool().query(
    `SELECT * FROM host_metric_samples ORDER BY sampled_at DESC LIMIT 1`,
  );
  return res.rows[0] ? rowToHostSample(res.rows[0]) : null;
}

export async function queryAllLatestInstanceMetrics() {
  if (!metricsEnabled()) return [] as InstanceMetricSample[];
  const res = await getPool().query(
    `SELECT DISTINCT ON (instance_id) *
     FROM instance_metric_samples
     ORDER BY instance_id, sampled_at DESC`,
  );
  return res.rows.map(rowToInstanceSample);
}

export async function queryInstancesOverview(from: string, to: string, sparklineLimit = 48) {
  if (!metricsEnabled()) return [] as InstanceMetricsOverviewItem[];
  const [statsRes, sparkRes, latest] = await Promise.all([
    getPool().query(
      `SELECT instance_id,
         avg(fps) AS avg_fps,
         min(fps) AS min_fps,
         max(fps) AS max_fps,
         avg(memory_mb)::int AS avg_memory_mb,
         max(player_count) AS peak_players,
         avg(player_count) AS avg_players,
         count(*)::int AS sample_count
       FROM instance_metric_samples
       WHERE sampled_at >= $1 AND sampled_at <= $2
       GROUP BY instance_id`,
      [from, to],
    ),
    getPool().query(
      `SELECT instance_id, sampled_at, fps, memory_mb, player_count
       FROM (
         SELECT *,
           ROW_NUMBER() OVER (PARTITION BY instance_id ORDER BY sampled_at DESC) AS rn
         FROM instance_metric_samples
         WHERE sampled_at >= $1 AND sampled_at <= $2
       ) ranked
       WHERE rn <= $3
       ORDER BY instance_id, sampled_at ASC`,
      [from, to, sparklineLimit],
    ),
    queryAllLatestInstanceMetrics(),
  ]);
  const statsById = new Map(
    statsRes.rows.map((row) => [
      String(row.instance_id),
      {
        avgFps: row.avg_fps == null ? null : Number(row.avg_fps),
        minFps: row.min_fps == null ? null : Number(row.min_fps),
        maxFps: row.max_fps == null ? null : Number(row.max_fps),
        avgMemoryMb: row.avg_memory_mb == null ? null : Number(row.avg_memory_mb),
        peakPlayers: row.peak_players == null ? null : Number(row.peak_players),
        avgPlayers: row.avg_players == null ? null : Math.round(Number(row.avg_players) * 10) / 10,
        sampleCount: Number(row.sample_count),
      },
    ]),
  );
  const latestById = new Map(latest.map((sample) => [sample.instanceId, sample]));
  const sparkById = new Map<string, InstanceMetricsSparkPoint[]>();
  for (const row of sparkRes.rows) {
    const id = String(row.instance_id);
    const list = sparkById.get(id) ?? [];
    list.push({
      at: new Date(String(row.sampled_at)).toISOString(),
      fps: row.fps == null ? null : Number(row.fps),
      memoryMb: row.memory_mb == null ? null : Number(row.memory_mb),
      players: row.player_count == null ? null : Number(row.player_count),
    });
    sparkById.set(id, list);
  }
  const ids = new Set([...statsById.keys(), ...latestById.keys(), ...sparkById.keys()]);
  return [...ids].map((instanceId) => ({
    instanceId,
    latest: latestById.get(instanceId) ?? null,
    stats: statsById.get(instanceId) ?? {
      avgFps: null,
      minFps: null,
      maxFps: null,
      avgMemoryMb: null,
      peakPlayers: null,
      avgPlayers: null,
      sampleCount: 0,
    },
    sparkline: sparkById.get(instanceId) ?? [],
  }));
}

export async function queryInstanceEvents(instanceId: string, from: string, to: string, limit = 100) {
  if (!metricsEnabled()) return [] as InstanceMetricEvent[];
  const res = await getPool().query(
    `SELECT * FROM instance_metric_events
     WHERE instance_id = $1 AND at >= $2 AND at <= $3
     ORDER BY at DESC
     LIMIT $4`,
    [instanceId, from, to, limit],
  );
  return res.rows.map(rowToEvent);
}

export async function queryMetricsSummary() {
  if (!metricsEnabled()) {
    return { enabled: false, retentionDays: RETENTION_DAYS, hostSamples: 0, instanceSamples: 0, oldestSample: null };
  }
  const res = await getPool().query(
    `SELECT
       (SELECT COUNT(*)::int FROM host_metric_samples) AS host_samples,
       (SELECT COUNT(*)::int FROM instance_metric_samples) AS instance_samples,
       (SELECT MIN(sampled_at) FROM (
          SELECT sampled_at FROM host_metric_samples
          UNION ALL
          SELECT sampled_at FROM instance_metric_samples
        ) s) AS oldest_sample`,
  );
  const row = res.rows[0];
  return {
    enabled: true,
    retentionDays: RETENTION_DAYS,
    hostSamples: Number(row.host_samples),
    instanceSamples: Number(row.instance_samples),
    oldestSample: row.oldest_sample ? new Date(String(row.oldest_sample)).toISOString() : null,
  };
}

export async function pruneOldMetrics() {
  if (!metricsEnabled()) return { hostDeleted: 0, instanceDeleted: 0, eventsDeleted: 0 };
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000).toISOString();
  const [host, instance, events] = await Promise.all([
    getPool().query(`DELETE FROM host_metric_samples WHERE sampled_at < $1`, [cutoff]),
    getPool().query(`DELETE FROM instance_metric_samples WHERE sampled_at < $1`, [cutoff]),
    getPool().query(`DELETE FROM instance_metric_events WHERE at < $1`, [cutoff]),
  ]);
  return {
    hostDeleted: host.rowCount ?? 0,
    instanceDeleted: instance.rowCount ?? 0,
    eventsDeleted: events.rowCount ?? 0,
  };
}

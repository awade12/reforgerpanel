"use client";

import { useId } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type ChartRow = Record<string, string | number>;

function ChartTooltip({
  active,
  payload,
  label,
  suffix = "",
}: {
  active?: boolean;
  payload?: { value?: number; name?: string; color?: string }[];
  label?: string;
  suffix?: string;
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div className="rounded-md border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
      {label && <p className="mb-1 font-medium text-foreground">{label}</p>}
      <p className="font-mono tabular-nums text-foreground">
        {item.value != null ? `${item.value}${suffix}` : "—"}
      </p>
    </div>
  );
}

export function MetricsAreaChart({
  title,
  value,
  hint,
  delta,
  dataKey,
  color,
  domain,
  suffix,
  data,
}: {
  title: string;
  value: string;
  hint?: string;
  delta?: string;
  dataKey: string;
  color: string;
  domain?: [number, number | "auto"];
  suffix?: string;
  data: ChartRow[];
}) {
  const chartId = useId().replace(/:/g, "");
  const safeData = data.length ? data : [{ at: "—", [dataKey]: 0 }];

  return (
    <div className="border border-border bg-[#0f1218] p-4">
      <div className="mb-3">
        <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{title}</p>
        <div className="mt-1 flex flex-wrap items-baseline gap-2">
          <p className="text-xl font-medium tabular-nums text-foreground">{value}</p>
          {delta && <p className="font-mono text-[10px] text-muted-foreground">{delta}</p>}
        </div>
        {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
      </div>
      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height={192}>
          <AreaChart id={chartId} data={safeData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={`grad-${chartId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                <stop offset="100%" stopColor={color} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis
              dataKey="at"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 10, fontFamily: "monospace" }}
            />
            <YAxis domain={domain ?? [0, "auto"]} hide />
            <Tooltip content={<ChartTooltip suffix={suffix} />} />
            <Area
              type="monotone"
              dataKey={dataKey}
              stroke={color}
              fill={`url(#grad-${chartId})`}
              strokeWidth={1.5}
              dot={safeData.length <= 2}
              baseValue={0}
              connectNulls
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function MetricsMultiLineChart({
  title,
  value,
  hint,
  series,
  data,
}: {
  title: string;
  value: string;
  hint?: string;
  series: { key: string; label: string; color: string }[];
  data: ChartRow[];
}) {
  const chartId = useId().replace(/:/g, "");
  const safeData = data.length ? data : [{ at: "—", ...Object.fromEntries(series.map((s) => [s.key, 0])) }];

  return (
    <div className="border border-border bg-[#0f1218] p-4">
      <div className="mb-3">
        <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{title}</p>
        <p className="mt-1 text-xl font-medium tabular-nums text-foreground">{value}</p>
        {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
        <div className="mt-2 flex flex-wrap gap-3">
          {series.map((item) => (
            <div key={item.key} className="flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="font-mono text-[10px] text-muted-foreground">{item.label}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height={192}>
          <LineChart id={chartId} data={safeData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis
              dataKey="at"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 10, fontFamily: "monospace" }}
            />
            <YAxis hide />
            <Tooltip content={<ChartTooltip />} />
            {series.map((item) => (
              <Line
                key={item.key}
                type="monotone"
                dataKey={item.key}
                stroke={item.color}
                strokeWidth={1.5}
                dot={safeData.length <= 2}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function MetricsSparkline({
  label,
  value,
  dataKey,
  color,
  data,
  suffix = "",
}: {
  label: string;
  value: string;
  dataKey: string;
  color: string;
  data: ChartRow[];
  suffix?: string;
}) {
  const chartId = useId().replace(/:/g, "");
  const safeData = data.length ? data : [{ at: "—", [dataKey]: 0 }];

  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <p className="font-mono text-[10px] uppercase text-muted-foreground">{label}</p>
        <p className="text-xs tabular-nums text-foreground">
          {value}
          {suffix}
        </p>
      </div>
      <div className="h-10 w-full">
        <ResponsiveContainer width="100%" height={40}>
          <AreaChart id={chartId} data={safeData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
            <Area
              type="monotone"
              dataKey={dataKey}
              stroke={color}
              fill={color}
              fillOpacity={0.15}
              strokeWidth={1.25}
              dot={false}
              baseValue={0}
              connectNulls
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function MetricsStatTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="border border-border bg-[#0f1218] px-4 py-3">
      <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-medium tabular-nums text-foreground">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

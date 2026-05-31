import { ImageResponse } from "next/og";
import { agentFetch } from "@/lib/agent-client";
import { statusBadgeColors, statusLabel, toStatusCardData } from "@/lib/shared/discord-status";
import type { InstanceRecord, RuntimeMeta } from "@/lib/shared/types";
import type { ServerConfig } from "@/lib/shared/config-schema";

export const runtime = "edge";

type InstancePayload = InstanceRecord & {
  config: ServerConfig;
  runtime?: RuntimeMeta;
};

function accentColor(status: string) {
  if (status === "running") return "#5c9fd4";
  if (status === "crashed") return "#d46a5a";
  if (status === "starting" || status === "stopping") return "#d4a574";
  return "#929aab";
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  try {
    const instance = await agentFetch<InstancePayload>(`/instances/${id}`);
    const logs = await agentFetch<{ fps: number | null }>(`/instances/${id}/logs?from=0`).catch(() => ({
      fps: null as number | null,
    }));
    const a2s = await agentFetch<{ playerCount: string }>(`/instances/${id}/a2s`).catch(() => null);

    const card = toStatusCardData({
      instance,
      config: instance.config,
      runtime: instance.runtime ?? {},
      fps: logs.fps,
      playerCount: a2s?.playerCount ?? null,
    });

    const badge = statusBadgeColors(card.status);
    const label = statusLabel(card.status).toUpperCase();
    const accent = accentColor(card.status);

    const metrics = [
      { label: "Players", value: card.players !== "—" ? card.players : card.slots },
      { label: "Server FPS", value: card.fps != null ? String(Math.round(card.fps)) : "—" },
      { label: "Uptime", value: card.uptime },
      { label: "Memory", value: card.memory },
      { label: "Branch", value: card.branch },
    ];

    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            background: "#14171c",
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          <div style={{ width: 6, background: accent, boxShadow: `0 0 24px ${accent}` }} />

          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              padding: "28px 32px",
              background: "linear-gradient(135deg, #171b22 0%, #1c2129 55%, #222830 100%)",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 0,
                right: 0,
                width: 280,
                height: 280,
                background: `radial-gradient(circle at top right, ${accent}22 0%, transparent 70%)`,
              }}
            />

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
                <div style={{ fontSize: 12, letterSpacing: "0.16em", textTransform: "uppercase", color: "#7eb0d4" }}>
                  Arma Reforger
                </div>
                <div style={{ fontSize: 36, fontWeight: 700, color: "#f2f4f8", lineHeight: 1.05 }}>{card.name}</div>
                <div style={{ fontSize: 16, color: "#a8b0be" }}>{card.scenario}</div>
                <div
                  style={{
                    marginTop: 4,
                    fontSize: 17,
                    color: "#dce4f2",
                    fontFamily: "ui-monospace, monospace",
                    letterSpacing: "0.02em",
                  }}
                >
                  {card.address}
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 15px",
                  borderRadius: 999,
                  background: badge.bg,
                  border: `1px solid ${badge.ring}`,
                  color: badge.fg,
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: "0.14em",
                }}
              >
                <div
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: 999,
                    background: badge.fg,
                    boxShadow: `0 0 10px ${badge.fg}`,
                  }}
                />
                {label}
              </div>
            </div>

            <div style={{ display: "flex", gap: 14, marginTop: 24 }}>
              {metrics.map((metric) => (
                <div
                  key={metric.label}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    flex: 1,
                    padding: "12px 14px",
                    borderRadius: 10,
                    background: "rgba(255,255,255,0.035)",
                    border: "1px solid rgba(220, 228, 242, 0.07)",
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      color: "#8b939f",
                    }}
                  >
                    {metric.label}
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 600, color: "#eef1f5" }}>{metric.value}</div>
                </div>
              ))}
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: 18,
                paddingTop: 14,
                borderTop: "1px solid rgba(220, 228, 242, 0.08)",
                color: "#6f7888",
                fontSize: 12,
              }}
            >
              <span>{card.slug}</span>
              <span>Reforger Panel</span>
            </div>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 320,
      },
    );
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

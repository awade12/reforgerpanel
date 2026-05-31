import type { NextConfig } from "next";

const sessionSecret =
  process.env.SESSION_SECRET ??
  process.env.AGENT_TOKEN ??
  "change-me-session-secret";

const allowedDevOrigins = [
  "127.0.0.1",
  "localhost",
  ...(process.env.ALLOWED_DEV_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean) ?? []),
];

if (process.env.PANEL_PUBLIC_HOST) {
  allowedDevOrigins.push(process.env.PANEL_PUBLIC_HOST);
}

const nextConfig: NextConfig = {
  allowedDevOrigins,
  env: {
    PANEL_SESSION_SECRET: sessionSecret,
  },
};

export default nextConfig;

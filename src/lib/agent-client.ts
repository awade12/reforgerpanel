const AGENT_URL = process.env.AGENT_URL ?? "http://127.0.0.1:9100";
const AGENT_TOKEN = process.env.AGENT_TOKEN ?? "change-me-agent-token";

export class AgentError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "AgentError";
  }
}

async function parseJsonSafe(res: Response) {
  const text = await res.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AgentError(text.slice(0, 200) || "Invalid response from agent", res.status || 502);
  }
}

export type AgentFetchOptions = RequestInit & {
  panel?: boolean;
  panelSession?: string;
};

export async function agentFetch<T = unknown>(path: string, init?: AgentFetchOptions): Promise<T> {
  const { panel, panelSession, ...requestInit } = init ?? {};
  let res: Response;
  try {
    res = await fetch(`${AGENT_URL}${path}`, {
      ...requestInit,
      headers: {
        Authorization: `Bearer ${AGENT_TOKEN}`,
        "Content-Type": "application/json",
        ...(panel ? { "x-reforger-panel": "1" } : {}),
        ...(panel && panelSession ? { "x-panel-session": panelSession } : {}),
        ...(requestInit.headers ?? {}),
      },
      cache: "no-store",
    });
  } catch {
    throw new AgentError("Host agent is not running. Start it with: npm run agent", 503);
  }

  const data = await parseJsonSafe(res);
  if (!res.ok) {
    throw new AgentError((data as { error?: string } | null)?.error ?? `Agent error ${res.status}`, res.status);
  }
  if (res.status === 204) return undefined as T;
  return data as T;
}

export function agentWsUrl(instanceId: string) {
  const base = AGENT_URL.replace(/^http/, "ws");
  return `${base}/ws/logs/${instanceId}`;
}

export { AGENT_TOKEN };

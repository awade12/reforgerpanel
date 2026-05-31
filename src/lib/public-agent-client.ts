const AGENT_URL = process.env.AGENT_URL ?? "http://127.0.0.1:9100";

export async function publicAgentFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${AGENT_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });
  } catch {
    throw new Error("Host agent is not running");
  }

  const text = await res.text();
  const data = text.trim() ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    throw new Error((data as { error?: string } | null)?.error ?? `Agent error ${res.status}`);
  }
  return data as T;
}

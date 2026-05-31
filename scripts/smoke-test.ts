const AGENT_URL = process.env.AGENT_URL ?? "http://127.0.0.1:9100";
const AGENT_TOKEN = process.env.AGENT_TOKEN ?? "change-me-agent-token";

type InstanceRow = { id: string; slug: string; status: string };

async function systemdActive(slug: string) {
  const { execSync } = await import("child_process");
  try {
    const out = execSync(`systemctl is-active reforger@${slug}`, { encoding: "utf8" }).trim();
    return out === "active";
  } catch {
    return false;
  }
}

function statusFromSystemd(active: boolean, current: string) {
  if (active) return current === "starting" || current === "stopping" ? current : "running";
  if (current === "running" || current === "starting") return "stopped";
  return current;
}

async function main() {
  const email = process.env.SMOKE_EMAIL?.trim();
  const password = process.env.SMOKE_PASSWORD?.trim();
  if (!email || !password) {
    console.error("Set SMOKE_EMAIL and SMOKE_PASSWORD for login smoke test");
    process.exit(1);
  }

  const loginRes = await fetch(`${AGENT_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const loginBody = (await loginRes.json()) as { token?: string; error?: string };
  if (!loginRes.ok || !loginBody.token) {
    console.error("Login failed:", loginBody.error ?? loginRes.status);
    process.exit(1);
  }

  const listRes = await fetch(`${AGENT_URL}/instances`, {
    headers: {
      Authorization: `Bearer ${AGENT_TOKEN}`,
      "x-reforger-panel": "1",
      "x-panel-session": loginBody.token,
    },
  });
  const instances = (await listRes.json()) as InstanceRow[];
  if (!listRes.ok || !Array.isArray(instances)) {
    console.error("List instances failed");
    process.exit(1);
  }

  let failures = 0;
  for (const instance of instances) {
    const active = await systemdActive(instance.slug);
    const expected = statusFromSystemd(active, instance.status);
    if (instance.status !== expected) {
      console.error(
        `[FAIL] ${instance.slug}: panel status=${instance.status} expected=${expected} (systemd active=${active})`,
      );
      failures += 1;
    } else {
      console.log(`[ok] ${instance.slug}: ${instance.status}`);
    }
  }

  if (failures > 0) {
    console.error(`${failures} instance(s) out of sync with systemd`);
    process.exit(1);
  }
  console.log(`Smoke test passed (${instances.length} instance(s))`);
}

void main();

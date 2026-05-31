import "../lib/shared/load-env";
import fs from "fs";
import { getPool, initDb, usePostgres } from "../agent/db";
import { jsonStorePath, loadJsonStore } from "../agent/db/json-store";
import { importStoreToPostgres } from "../agent/db/postgres";

async function postgresHasData() {
  if (!usePostgres()) return false;
  const res = await getPool().query("SELECT COUNT(*)::int AS n FROM instances");
  return Number(res.rows[0]?.n ?? 0) > 0;
}

async function main() {
  if (!usePostgres()) {
    console.error("DATABASE_URL is not set. Add it to .env.local or /etc/reforgerpanel/env first.");
    console.error("  sudo bash scripts/setup-postgres.sh");
    process.exit(1);
  }

  const jsonPath = jsonStorePath();
  if (!fs.existsSync(jsonPath)) {
    console.log("No panel.json found — initializing empty PostgreSQL schema only.");
    await initDb();
    console.log("Done.");
    return;
  }

  if (await postgresHasData()) {
    console.log("PostgreSQL already has instance data — skipping JSON import.");
    await initDb();
    return;
  }

  const store = loadJsonStore();
  console.log(
    `Importing ${store.instances.length} instance(s), ${store.missions.length} mission(s), ${store.audit.length} audit row(s)…`,
  );
  await importStoreToPostgres(store);
  const backup = `${jsonPath}.pre-postgres.${Date.now()}.bak`;
  fs.renameSync(jsonPath, backup);
  console.log(`Import complete. JSON backed up to ${backup}`);
  console.log("Restart the agent: npm run agent  (or systemctl restart reforgerpanel-agent)");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

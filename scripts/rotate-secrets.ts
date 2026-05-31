import { getSettings, saveSettings } from "../agent/db";
import { initDb } from "../agent/db";
import { decryptSecret, encryptSecret } from "../lib/shared/secrets-crypto";

function reencrypt(value: string) {
  if (!value?.trim()) return value;
  const oldKey = process.env.SECRETS_ENCRYPTION_KEY_OLD?.trim();
  const newKey = process.env.SECRETS_ENCRYPTION_KEY?.trim();
  if (!oldKey || !newKey) throw new Error("SECRETS_ENCRYPTION_KEY_OLD and SECRETS_ENCRYPTION_KEY are required");
  const plain = decryptSecret(value, { SECRETS_ENCRYPTION_KEY: oldKey });
  return encryptSecret(plain, { SECRETS_ENCRYPTION_KEY: newKey });
}

async function main() {
  await initDb();
  const settings = getSettings();
  const next = {
    ...settings,
    discordBotToken: reencrypt(settings.discordBotToken),
    discordWebhookUrl: settings.discordWebhookUrl,
    resendApiKey: reencrypt(settings.resendApiKey),
  };
  saveSettings(next);
  console.log("Settings secrets re-encrypted.");
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

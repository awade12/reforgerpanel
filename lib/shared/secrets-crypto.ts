import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const PREFIX = "enc:v1:";

type SecretEnv = {
  SECRETS_ENCRYPTION_KEY?: string;
  SESSION_SECRET?: string;
  PANEL_SESSION_SECRET?: string;
};

function secretEnv(env?: SecretEnv): SecretEnv {
  return env ?? (process.env as SecretEnv);
}

export function secretsEncryptionConfigured(env?: SecretEnv) {
  return Boolean(resolveSecretsKeyMaterial(env));
}

function resolveSecretsKeyMaterial(env?: SecretEnv) {
  const e = secretEnv(env);
  return (
    e.SECRETS_ENCRYPTION_KEY?.trim() ||
    e.PANEL_SESSION_SECRET?.trim() ||
    e.SESSION_SECRET?.trim() ||
    ""
  );
}

function deriveKey(env?: SecretEnv) {
  const material = resolveSecretsKeyMaterial(env);
  if (!material) return null;
  return createHash("sha256").update(material).digest();
}

export function isEncryptedSecret(value: string) {
  return value.startsWith(PREFIX);
}

export function encryptSecret(plaintext: string, env?: SecretEnv) {
  if (!plaintext || isEncryptedSecret(plaintext)) return plaintext;
  const key = deriveKey(env);
  if (!key) return plaintext;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

export function decryptSecret(value: string, env?: SecretEnv) {
  if (!value || !isEncryptedSecret(value)) return value;
  const key = deriveKey(env);
  if (!key) throw new Error("SECRETS_ENCRYPTION_KEY is required to decrypt stored secrets");
  const payload = value.slice(PREFIX.length);
  const [ivB64, tagB64, dataB64] = payload.split(":");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Invalid encrypted secret format");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64url")), decipher.final()]);
  return decrypted.toString("utf8");
}

export function encryptSecretField(value: string, env?: SecretEnv) {
  if (!value) return value;
  try {
    return encryptSecret(value, env);
  } catch {
    return value;
  }
}

export function decryptSecretField(value: string, env?: SecretEnv) {
  if (!value) return value;
  try {
    return decryptSecret(value, env);
  } catch (err) {
    console.error("[secrets] decrypt failed:", err instanceof Error ? err.message : err);
    return "";
  }
}

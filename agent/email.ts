import { PANEL_NAME } from "../lib/shared/panel-brand";
import type { SettingsRecord } from "../lib/shared/types";

export async function sendResendTestEmail(settings: SettingsRecord, to: string) {
  const apiKey = settings.resendApiKey.trim();
  const from = settings.resendFromEmail.trim();
  if (!apiKey) throw new Error("Resend API key not configured");
  if (!from) throw new Error("Resend from email not configured");
  if (!to.trim()) throw new Error("Recipient email required");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to.trim()],
      subject: `${PANEL_NAME} — test email`,
      html: `<p>Email delivery from ${PANEL_NAME} is working.</p>`,
    }),
  });

  const data = (await res.json().catch(() => ({}))) as { message?: string; id?: string };
  if (!res.ok) {
    throw new Error(data.message ?? `Resend error ${res.status}`);
  }
  return { id: data.id ?? null };
}

/**
 * Plain server-side WhatsApp notifications (no remote `command()` wrapper),
 * so they work outside any HTTP request — e.g. from node-cron.
 */
import { resolveEnv } from "./db/utils";

/**
 * Send a WhatsApp text message via the WA gateway.
 * Recipient defaults to WHATSAPP_ADMIN (the ops/admin number).
 */
export async function sendWhatsAppText(text: string, recipient?: string): Promise<boolean> {
  try {
    const env = await resolveEnv();
    const to = recipient ?? env.WHATSAPP_ADMIN;
    if (!env.WHATSAPP_HOST || !env.WHATSAPP_AUTH || !to) {
      console.error("[notify] Missing WHATSAPP_HOST/WHATSAPP_AUTH/WHATSAPP_ADMIN — cannot send WhatsApp");
      return false;
    }

    const res = await fetch(env.WHATSAPP_HOST + "/api/v1/send", {
      method: "POST",
      headers: {
        Authorization: env.WHATSAPP_AUTH,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ recipient: to, payload: { text } }),
    });

    if (!res.ok) {
      console.error("[notify] WA gateway responded", res.status, res.statusText);
      return false;
    }

    console.log("[notify] WhatsApp sent to", to);
    return true;
  } catch (err) {
    console.error("[notify] Failed to send WhatsApp:", err);
    return false;
  }
}

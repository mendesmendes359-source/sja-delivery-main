// Server-only SMS helper via Twilio connector gateway.
// Silently no-ops if TWILIO_API_KEY / LOVABLE_API_KEY / TWILIO_FROM_NUMBER not configured.

export type SmsResult = {
  ok: boolean;
  provider_message_id?: string;
  error?: string;
  skipped?: boolean;
};

export async function sendSmsServer(to: string, body: string): Promise<SmsResult> {
  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
  const TWILIO_API_KEY = process.env.TWILIO_API_KEY;
  const TWILIO_FROM_NUMBER = process.env.TWILIO_FROM_NUMBER;

  if (!LOVABLE_API_KEY || !TWILIO_API_KEY || !TWILIO_FROM_NUMBER) {
    console.warn("[sms] Twilio não configurado — SMS não enviado.");
    return { ok: false, skipped: true, error: "twilio_not_configured" };
  }

  try {
    const res = await fetch("https://connector-gateway.lovable.dev/twilio/Messages.json", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": TWILIO_API_KEY,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: TWILIO_FROM_NUMBER, Body: body }).toString(),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[sms] Twilio ${res.status}: ${text}`);
      return { ok: false, error: `twilio_${res.status}` };
    }
    const json = (await res.json()) as { sid?: string };
    return { ok: true, provider_message_id: json.sid };
  } catch (e) {
    console.error("[sms] error", e);
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

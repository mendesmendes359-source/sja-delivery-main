// Server-only Twilio REST API integration.
// Credentials are read exclusively from the server environment.

export type SmsResult = {
  ok: boolean;
  provider_message_id?: string;
  error?: string;
  skipped?: boolean;
};

export type TwilioConfigurationStatus = {
  configured: boolean;
  authMode: "api_key" | "auth_token" | "missing";
  senderMode: "messaging_service" | "phone_number" | "missing";
  issues: string[];
};

type TwilioConfiguration = {
  accountSid: string;
  username: string;
  password: string;
  messagingServiceSid?: string;
  fromNumber?: string;
};

const E164_PHONE = /^\+[1-9]\d{7,14}$/;

function clean(value: string | undefined) {
  return value?.trim() ?? "";
}

export function normalizeSmsPhoneNumber(value: string) {
  let phone = value.trim().replace(/[\s().-]/g, "");

  if (phone.startsWith("00")) phone = `+${phone.slice(2)}`;
  if (/^2449\d{8}$/.test(phone)) phone = `+${phone}`;
  if (/^9\d{8}$/.test(phone)) phone = `+244${phone}`;

  return E164_PHONE.test(phone) ? phone : null;
}

export function getTwilioConfigurationStatus(): TwilioConfigurationStatus {
  const accountSid = clean(process.env.TWILIO_ACCOUNT_SID);
  const apiKeySid = clean(process.env.TWILIO_API_KEY_SID);
  const apiKeySecret = clean(process.env.TWILIO_API_KEY_SECRET);
  const authToken = clean(process.env.TWILIO_AUTH_TOKEN);
  const messagingServiceSid = clean(process.env.TWILIO_MESSAGING_SERVICE_SID);
  const fromNumber = clean(process.env.TWILIO_FROM_NUMBER);
  const issues: string[] = [];

  const apiKeyComplete = Boolean(apiKeySid && apiKeySecret);
  const authMode = apiKeyComplete ? "api_key" : authToken ? "auth_token" : "missing";
  const senderMode = messagingServiceSid
    ? "messaging_service"
    : fromNumber
      ? "phone_number"
      : "missing";

  if (!accountSid) {
    issues.push("TWILIO_ACCOUNT_SID em falta");
  } else if (!accountSid.startsWith("AC")) {
    issues.push("TWILIO_ACCOUNT_SID inválido");
  }

  if ((apiKeySid && !apiKeySecret) || (!apiKeySid && apiKeySecret)) {
    issues.push("TWILIO_API_KEY_SID e TWILIO_API_KEY_SECRET devem ser definidos em conjunto");
  } else if (apiKeyComplete && !apiKeySid.startsWith("SK")) {
    issues.push("TWILIO_API_KEY_SID inválido");
  } else if (authMode === "missing") {
    issues.push("credencial Twilio em falta");
  }

  if (messagingServiceSid && !messagingServiceSid.startsWith("MG")) {
    issues.push("TWILIO_MESSAGING_SERVICE_SID inválido");
  } else if (fromNumber && !normalizeSmsPhoneNumber(fromNumber)) {
    issues.push("TWILIO_FROM_NUMBER deve estar no formato E.164");
  } else if (senderMode === "missing") {
    issues.push("remetente Twilio em falta");
  }

  return {
    configured: issues.length === 0,
    authMode,
    senderMode,
    issues,
  };
}

function getTwilioConfiguration(): TwilioConfiguration | null {
  const status = getTwilioConfigurationStatus();
  if (!status.configured) return null;

  const accountSid = clean(process.env.TWILIO_ACCOUNT_SID);
  const usingApiKey = status.authMode === "api_key";
  const messagingServiceSid = clean(process.env.TWILIO_MESSAGING_SERVICE_SID);
  const fromNumber = normalizeSmsPhoneNumber(clean(process.env.TWILIO_FROM_NUMBER));

  return {
    accountSid,
    username: usingApiKey ? clean(process.env.TWILIO_API_KEY_SID) : accountSid,
    password: usingApiKey
      ? clean(process.env.TWILIO_API_KEY_SECRET)
      : clean(process.env.TWILIO_AUTH_TOKEN),
    messagingServiceSid: messagingServiceSid || undefined,
    fromNumber: messagingServiceSid ? undefined : fromNumber || undefined,
  };
}

export async function sendSmsServer(to: string, body: string): Promise<SmsResult> {
  const configuration = getTwilioConfiguration();
  if (!configuration) {
    console.warn("[sms] Twilio não configurado — SMS não enviado.");
    return { ok: false, skipped: true, error: "twilio_not_configured" };
  }

  const recipient = normalizeSmsPhoneNumber(to);
  if (!recipient) {
    return { ok: false, error: "invalid_phone_number" };
  }

  const form = new URLSearchParams({
    To: recipient,
    Body: body,
  });

  if (configuration.messagingServiceSid) {
    form.set("MessagingServiceSid", configuration.messagingServiceSid);
  } else if (configuration.fromNumber) {
    form.set("From", configuration.fromNumber);
  }

  try {
    const credentials = btoa(`${configuration.username}:${configuration.password}`);
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(configuration.accountSid)}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form.toString(),
      },
    );
    const payload = (await response.json().catch(() => null)) as {
      sid?: string;
      code?: number;
    } | null;

    if (!response.ok) {
      const errorCode = payload?.code ? `_${payload.code}` : "";
      console.error(`[sms] Twilio respondeu com HTTP ${response.status}${errorCode}.`);
      return { ok: false, error: `twilio_${response.status}${errorCode}` };
    }

    if (!payload?.sid) {
      console.error("[sms] Twilio não devolveu o identificador da mensagem.");
      return { ok: false, error: "twilio_invalid_response" };
    }

    return { ok: true, provider_message_id: payload.sid };
  } catch (error) {
    console.error("[sms] Falha de comunicação com a Twilio.", error);
    return { ok: false, error: "twilio_network_error" };
  }
}

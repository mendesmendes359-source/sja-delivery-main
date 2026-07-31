import { getRequest } from "@tanstack/react-start/server";
import { getSupabaseAdminConfig } from "@/integrations/supabase/env.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function getClientIp() {
  const headers = getRequest().headers;
  const forwarded =
    headers.get("x-vercel-forwarded-for") ||
    headers.get("cf-connecting-ip") ||
    headers.get("x-forwarded-for") ||
    headers.get("x-real-ip") ||
    "unknown";

  return forwarded.split(",", 1)[0]?.trim().slice(0, 128) || "unknown";
}

function normalizePhoneForLimit(phone: string) {
  let normalized = phone.trim().replace(/[\s().-]/g, "");
  if (normalized.startsWith("00")) normalized = `+${normalized.slice(2)}`;
  if (/^2449\d{8}$/.test(normalized)) normalized = `+${normalized}`;
  if (/^9\d{8}$/.test(normalized)) normalized = `+244${normalized}`;
  return normalized.toLowerCase();
}

async function hmacSubject(scope: "ip" | "phone", value: string) {
  const { adminKey } = getSupabaseAdminConfig();
  const secret = process.env.ORDER_RATE_LIMIT_SECRET?.trim() || adminKey;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`${scope}:${value}`));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

export async function consumeOrderRateLimit(phone: string) {
  const [ipHash, phoneHash] = await Promise.all([
    hmacSubject("ip", getClientIp()),
    hmacSubject("phone", normalizePhoneForLimit(phone)),
  ]);
  const { data, error } = await supabaseAdmin.rpc("consume_order_rate_limit", {
    p_ip_hash: ipHash,
    p_phone_hash: phoneHash,
  });

  if (error) throw new Error("Não foi possível validar o limite de pedidos");
  const result = data?.[0];
  if (!result) throw new Error("Não foi possível validar o limite de pedidos");
  return result;
}

export function createRateLimitError(retryAfterSeconds: number) {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return Object.assign(
    new Error(`Limite de pedidos atingido. Tente novamente dentro de ${minutes} min.`),
    { statusCode: 429 },
  );
}

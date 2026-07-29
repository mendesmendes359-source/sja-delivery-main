import type { Database } from "@/integrations/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendSmsServer, type SmsResult } from "@/lib/sms.server";
import {
  encodeSmsLogMetadata,
  NOTIFICATION_SETTINGS_PHONE,
  parseNotificationSettings,
} from "@/lib/sms-log";

export type OrderStage = Database["public"]["Enums"]["order_status"];

export type OrderNotificationData = {
  id: string;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  order_type: Database["public"]["Enums"]["order_type"];
  status: OrderStage;
  total_cents: number;
};

type NotificationRecipient = {
  phone: string;
  type: "customer" | "admin";
  body: string;
};

const STAGE_LABELS: Record<OrderStage, string> = {
  pendente: "Pendente",
  aceite: "Aceite",
  em_preparacao: "Em preparação",
  saiu_entrega: "Saiu para entrega",
  entregue: "Entregue",
  cancelado: "Cancelado",
};

function formatKwanza(cents: number) {
  return new Intl.NumberFormat("pt-AO", {
    style: "currency",
    currency: "AOA",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function customerMessage(order: OrderNotificationData, stage: OrderStage) {
  const messages: Record<OrderStage, string> = {
    pendente: `SJA: recebemos o pedido ${order.order_number}. Total ${formatKwanza(order.total_cents)}. Avisaremos em cada fase.`,
    aceite: `SJA: o pedido ${order.order_number} foi aceite e seguirá para preparação.`,
    em_preparacao: `SJA: o pedido ${order.order_number} está a ser preparado.`,
    saiu_entrega:
      order.order_type === "entrega"
        ? `SJA: o pedido ${order.order_number} saiu para entrega. Prepare-se para receber.`
        : `SJA: o pedido ${order.order_number} está pronto para levantamento.`,
    entregue: `SJA: o pedido ${order.order_number} foi concluído. Obrigado pela preferência!`,
    cancelado: `SJA: o pedido ${order.order_number} foi cancelado. Contacte-nos se precisar de ajuda.`,
  };

  return messages[stage];
}

function adminMessage(order: OrderNotificationData, stage: OrderStage) {
  const type = order.order_type === "entrega" ? "entrega" : "take-away";
  return `SJA Admin: ${order.order_number} · ${STAGE_LABELS[stage]}. Cliente: ${order.customer_name} (${order.customer_phone}). ${type}, ${formatKwanza(order.total_cents)}.`;
}

async function sendAndLog(
  client: SupabaseClient<Database>,
  orderId: string,
  stage: OrderStage,
  recipient: NotificationRecipient,
): Promise<SmsResult> {
  const result = await sendSmsServer(recipient.phone, recipient.body);
  const { error } = await client.from("sms_logs").insert({
    to_phone: recipient.phone,
    body: recipient.body,
    status: result.ok ? "sent" : result.skipped ? "skipped" : "failed",
    provider_message_id: encodeSmsLogMetadata({
      recipient_type: recipient.type,
      event: stage,
      provider_message_id: result.provider_message_id ?? null,
    }),
    error: result.error ?? null,
    order_id: orderId,
  });

  if (error) {
    console.error("[sms] falha ao registar notificação", error);
  }

  return result;
}

export async function notifyOrderStage(
  order: OrderNotificationData,
  stage: OrderStage,
  client: SupabaseClient<Database>,
) {
  const { data: settingsRow, error } = await client
    .from("sms_logs")
    .select("body")
    .eq("to_phone", NOTIFICATION_SETTINGS_PHONE)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[sms] falha ao carregar definições", error);
  }
  const settings = parseNotificationSettings(settingsRow?.body);

  const recipients: NotificationRecipient[] = [];
  if (settings.notify_customer) {
    recipients.push({
      phone: order.customer_phone,
      type: "customer",
      body: customerMessage(order, stage),
    });
  }
  if (settings.notify_admin && settings.admin_phone) {
    recipients.push({
      phone: settings.admin_phone,
      type: "admin",
      body: adminMessage(order, stage),
    });
  }

  const results = await Promise.all(
    recipients.map((recipient) => sendAndLog(client, order.id, stage, recipient)),
  );

  return {
    attempted: recipients.length,
    sent: results.filter((result) => result.ok).length,
    skipped: results.filter((result) => result.skipped).length,
    failed: results.filter((result) => !result.ok && !result.skipped).length,
    adminMissingPhone: Boolean(settings.notify_admin && !settings.admin_phone),
  };
}

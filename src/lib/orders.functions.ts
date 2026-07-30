import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  encodeSmsLogMetadata,
  NOTIFICATION_SETTINGS_PHONE,
  type NotificationSettings,
} from "@/lib/sms-log";

const CartItemSchema = z.object({
  menu_item_id: z.string().uuid(),
  quantity: z.number().int().min(1).max(50),
});

const CreateOrderSchema = z
  .object({
    customer_name: z.string().trim().min(2).max(100),
    customer_phone: z.string().trim().min(6).max(20),
    address: z.string().trim().max(300).optional().nullable(),
    order_type: z.enum(["entrega", "takeaway"]),
    notes: z.string().trim().max(500).optional().nullable(),
    items: z.array(CartItemSchema).min(1).max(50),
  })
  .superRefine((data, ctx) => {
    if (data.order_type === "entrega" && (!data.address || data.address.length < 3)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["address"],
        message: "A morada é obrigatória para entrega",
      });
    }
  });

export const createOrder = createServerFn({ method: "POST" })
  .validator((data: unknown) => CreateOrderSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabasePublicServer } = await import("@/integrations/supabase/client.public-server");

    const { data: createdOrders, error } = await supabasePublicServer.rpc("create_public_order", {
      p_customer_name: data.customer_name,
      p_customer_phone: data.customer_phone,
      p_address: data.order_type === "entrega" ? (data.address ?? null) : null,
      p_order_type: data.order_type,
      p_notes: data.notes ?? null,
      p_items: data.items,
    });
    const order = createdOrders?.[0];
    if (error || !order) throw new Error(error?.message ?? "Falhou criar pedido");

    // Notify customer and administrator without blocking order creation.
    try {
      const { notifyOrderStage } = await import("@/lib/notifications.server");
      await notifyOrderStage(
        {
          id: order.id,
          order_number: order.order_number,
          customer_name: data.customer_name,
          customer_phone: data.customer_phone,
          order_type: data.order_type,
          status: order.status,
          total_cents: order.total_cents,
        },
        "pendente",
        supabasePublicServer,
      );
    } catch (error) {
      console.warn("[sms] erro ao notificar novo pedido", error);
    }

    return {
      id: order.id,
      order_number: order.order_number,
      total_cents: order.total_cents,
    };
  });

const UpdateStatusSchema = z
  .object({
    order_id: z.string().uuid(),
    status: z.enum([
      "pendente",
      "aceite",
      "em_preparacao",
      "saiu_entrega",
      "entregue",
      "cancelado",
    ]),
    cancellation_reason: z.string().trim().max(500).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (
      data.status === "cancelado" &&
      (!data.cancellation_reason || data.cancellation_reason.length < 3)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["cancellation_reason"],
        message: "Indique um motivo de cancelamento com pelo menos 3 caracteres",
      });
    }
  });

export const updateOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => UpdateStatusSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { data: isStaff } = await context.supabase.rpc("is_staff", { _user_id: context.userId });
    if (!isStaff) throw new Error("Não autorizado");

    const select =
      "id, order_number, customer_name, customer_phone, order_type, status, cancellation_reason, total_cents";
    const { data: currentOrder, error: currentError } = await context.supabase
      .from("orders")
      .select(select)
      .eq("id", data.order_id)
      .single();
    if (currentError || !currentOrder) {
      throw new Error(currentError?.message ?? "Pedido não encontrado");
    }

    const cancellationReason =
      data.status === "cancelado" ? (data.cancellation_reason?.trim() ?? null) : null;

    if (
      currentOrder.status === data.status &&
      currentOrder.cancellation_reason === cancellationReason
    ) {
      return { ...currentOrder, notifications: null, unchanged: true };
    }

    const { data: order, error } = await context.supabase
      .from("orders")
      .update({ status: data.status, cancellation_reason: cancellationReason })
      .eq("id", data.order_id)
      .select(select)
      .single();
    if (error || !order) throw new Error(error?.message ?? "Falha");

    let notifications = null;
    try {
      const { notifyOrderStage } = await import("@/lib/notifications.server");
      notifications = await notifyOrderStage(order, data.status, context.supabase);
    } catch (notificationError) {
      console.warn("[sms] erro ao notificar mudança de estado", notificationError);
    }

    return { ...order, notifications, unchanged: false };
  });

const SendSmsSchema = z.object({
  to: z.string().trim().min(6).max(20),
  body: z.string().trim().min(1).max(500),
});

export const sendManualSms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => SendSmsSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { data: isStaff } = await context.supabase.rpc("is_staff", { _user_id: context.userId });
    if (!isStaff) throw new Error("Não autorizado");
    const { sendSmsServer } = await import("@/lib/sms.server");
    const res = await sendSmsServer(data.to, data.body);
    await context.supabase.from("sms_logs").insert({
      to_phone: data.to,
      body: data.body,
      status: res.ok ? "sent" : res.skipped ? "skipped" : "failed",
      provider_message_id: encodeSmsLogMetadata({
        recipient_type: "manual",
        event: "manual",
        provider_message_id: res.provider_message_id ?? null,
      }),
      error: res.error ?? null,
    });
    return res;
  });

export const getSmsProviderStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isStaff } = await context.supabase.rpc("is_staff", {
      _user_id: context.userId,
    });
    if (!isStaff) throw new Error("Não autorizado");

    const { getTwilioConfigurationStatus } = await import("@/lib/sms.server");
    return getTwilioConfigurationStatus();
  });

const NotificationSettingsSchema = z.object({
  admin_phone: z.string().trim().max(20).nullable(),
  notify_customer: z.boolean(),
  notify_admin: z.boolean(),
});

export const saveNotificationSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => NotificationSettingsSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Apenas administradores podem alterar estas definições");

    const settings: NotificationSettings = {
      ...data,
      admin_phone: data.admin_phone || null,
    };
    const { error } = await context.supabase.from("sms_logs").insert({
      to_phone: NOTIFICATION_SETTINGS_PHONE,
      body: JSON.stringify(settings),
      status: "configuration",
    });
    if (error) throw new Error(error.message);

    return settings;
  });

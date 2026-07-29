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

const CreateOrderSchema = z.object({
  customer_name: z.string().trim().min(2).max(100),
  customer_phone: z.string().trim().min(6).max(20),
  address: z.string().trim().max(300).optional().nullable(),
  order_type: z.enum(["entrega", "takeaway"]),
  notes: z.string().trim().max(500).optional().nullable(),
  items: z.array(CartItemSchema).min(1).max(50),
});

export const createOrder = createServerFn({ method: "POST" })
  .validator((data: unknown) => CreateOrderSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabasePublicServer } = await import("@/integrations/supabase/client.public-server");

    // Fetch menu items to compute authoritative prices
    const ids = data.items.map((i) => i.menu_item_id);
    const { data: menu, error: menuErr } = await supabasePublicServer
      .from("menu_items")
      .select("id, name, price_cents, available")
      .in("id", ids);
    if (menuErr) throw new Error(menuErr.message);
    if (!menu || menu.length === 0) throw new Error("Itens do menu inválidos");

    const menuMap = new Map(menu.map((m) => [m.id, m]));
    let total_cents = 0;
    const itemRows = data.items.map((i) => {
      const m = menuMap.get(i.menu_item_id);
      if (!m) throw new Error("Item não encontrado");
      if (!m.available) throw new Error(`"${m.name}" não está disponível`);
      total_cents += m.price_cents * i.quantity;
      return {
        menu_item_id: m.id,
        name_snapshot: m.name,
        unit_price_cents: m.price_cents,
        quantity: i.quantity,
      };
    });

    const { data: order, error: orderErr } = await supabasePublicServer
      .from("orders")
      .insert({
        customer_name: data.customer_name,
        customer_phone: data.customer_phone,
        address: data.address ?? null,
        order_type: data.order_type,
        notes: data.notes ?? null,
        total_cents,
      })
      .select("id, order_number, total_cents, status")
      .single();
    if (orderErr || !order) throw new Error(orderErr?.message ?? "Falhou criar pedido");

    const { error: itemsErr } = await supabasePublicServer
      .from("order_items")
      .insert(itemRows.map((r) => ({ ...r, order_id: order.id })));
    if (itemsErr) throw new Error(itemsErr.message);

    // Decrement stock via ingredients (best-effort, no failure)
    try {
      const { data: recipes } = await supabasePublicServer
        .from("menu_item_ingredients")
        .select("menu_item_id, stock_item_id, quantity")
        .in("menu_item_id", ids);
      if (recipes && recipes.length) {
        const decrements = new Map<string, number>();
        for (const it of data.items) {
          for (const r of recipes.filter((x) => x.menu_item_id === it.menu_item_id)) {
            decrements.set(
              r.stock_item_id,
              (decrements.get(r.stock_item_id) ?? 0) + Number(r.quantity) * it.quantity,
            );
          }
        }
        for (const [stockId, qty] of decrements) {
          const { data: cur } = await supabasePublicServer
            .from("stock_items")
            .select("quantity")
            .eq("id", stockId)
            .single();
          if (cur) {
            await supabasePublicServer
              .from("stock_items")
              .update({ quantity: Math.max(0, Number(cur.quantity) - qty) })
              .eq("id", stockId);
          }
        }
      }
    } catch (e) {
      console.warn("[stock] erro ao debitar", e);
    }

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
          total_cents,
        },
        "pendente",
        supabasePublicServer,
      );
    } catch (error) {
      console.warn("[sms] erro ao notificar novo pedido", error);
    }

    return { id: order.id, order_number: order.order_number, total_cents };
  });

const UpdateStatusSchema = z.object({
  order_id: z.string().uuid(),
  status: z.enum(["pendente", "aceite", "em_preparacao", "saiu_entrega", "entregue", "cancelado"]),
});

export const updateOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => UpdateStatusSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { data: isStaff } = await context.supabase.rpc("is_staff", { _user_id: context.userId });
    if (!isStaff) throw new Error("Não autorizado");

    const select =
      "id, order_number, customer_name, customer_phone, order_type, status, total_cents";
    const { data: currentOrder, error: currentError } = await context.supabase
      .from("orders")
      .select(select)
      .eq("id", data.order_id)
      .single();
    if (currentError || !currentOrder) {
      throw new Error(currentError?.message ?? "Pedido não encontrado");
    }

    if (currentOrder.status === data.status) {
      return { ...currentOrder, notifications: null, unchanged: true };
    }

    const { data: order, error } = await context.supabase
      .from("orders")
      .update({ status: data.status })
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

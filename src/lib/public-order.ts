import { z } from "zod";

export const PublicOrderPayloadSchema = z.object({
  order: z.object({
    id: z.string().uuid(),
    order_number: z.string(),
    status: z.enum([
      "pendente",
      "aceite",
      "em_preparacao",
      "saiu_entrega",
      "entregue",
      "cancelado",
    ]),
    cancellation_reason: z.string().nullable(),
    subtotal_cents: z.number().int().nonnegative(),
    delivery_fee_cents: z.number().int().nonnegative(),
    total_cents: z.number().int(),
    order_type: z.enum(["entrega", "takeaway"]),
    estimated_delivery_at: z.string().nullable(),
    tracking_expires_at: z.string(),
    created_at: z.string(),
  }),
  items: z.array(
    z.object({
      id: z.string().uuid(),
      name_snapshot: z.string(),
      quantity: z.number().int(),
      unit_price_cents: z.number().int(),
    }),
  ),
});

export type PublicOrderPayload = z.infer<typeof PublicOrderPayloadSchema>;

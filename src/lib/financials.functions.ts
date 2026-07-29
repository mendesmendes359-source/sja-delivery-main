import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

type FinancialOrder = Pick<
  Database["public"]["Tables"]["orders"]["Row"],
  "total_cents" | "status" | "created_at"
>;
type FinancialExpense = Pick<
  Database["public"]["Tables"]["expenses"]["Row"],
  "amount_cents" | "category" | "expense_date"
>;

const RangeSchema = z.object({
  from: z.string(), // ISO date
  to: z.string(),
});

export const getFinancials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => RangeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: isStaff } = await context.supabase.rpc("is_staff", { _user_id: context.userId });
    if (!isStaff) throw new Error("Não autorizado");

    const [ordersRes, expensesRes] = await Promise.all([
      context.supabase
        .from("orders")
        .select("total_cents, status, created_at")
        .gte("created_at", data.from)
        .lte("created_at", data.to),
      context.supabase
        .from("expenses")
        .select("amount_cents, category, expense_date")
        .gte("expense_date", data.from.slice(0, 10))
        .lte("expense_date", data.to.slice(0, 10)),
    ]);

    const orders = (ordersRes.data ?? []) as FinancialOrder[];
    const expenses = (expensesRes.data ?? []) as FinancialExpense[];
    const revenue_cents = orders
      .filter((o) => o.status === "entregue")
      .reduce((s, o) => s + o.total_cents, 0);
    const gross_cents = orders
      .filter((o) => o.status !== "cancelado")
      .reduce((s, o) => s + o.total_cents, 0);
    const expenses_cents = expenses.reduce((s, e) => s + e.amount_cents, 0);
    const orders_count = orders.length;
    const delivered_count = orders.filter((o) => o.status === "entregue").length;

    return {
      revenue_cents,
      gross_cents,
      expenses_cents,
      profit_cents: revenue_cents - expenses_cents,
      orders_count,
      delivered_count,
      expenses_by_category: Object.entries(
        expenses.reduce<Record<string, number>>((acc, e) => {
          acc[e.category] = (acc[e.category] ?? 0) + e.amount_cents;
          return acc;
        }, {}),
      ).map(([category, total_cents]) => ({ category, total_cents })),
    };
  });

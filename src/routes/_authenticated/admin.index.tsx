import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney } from "@/lib/format";
import { Banknote, ClipboardList, Package, TrendingUp } from "lucide-react";

const dashQO = queryOptions({
  queryKey: ["admin", "dash"],
  queryFn: async () => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const iso = today.toISOString();
    const [orders, stock] = await Promise.all([
      supabase.from("orders").select("id, total_cents, status, created_at").gte("created_at", iso),
      supabase.from("stock_items").select("id, name, quantity, min_quantity"),
    ]);
    if (orders.error) throw orders.error;
    if (stock.error) throw stock.error;
    const today_orders = orders.data ?? [];
    const revenue = today_orders.filter((o) => o.status === "entregue").reduce((s, o) => s + o.total_cents, 0);
    const pending = today_orders.filter((o) => o.status !== "entregue" && o.status !== "cancelado").length;
    const lowStock = (stock.data ?? []).filter((s) => Number(s.quantity) <= Number(s.min_quantity));
    return { today_orders, revenue, pending, lowStock };
  },
  refetchInterval: 20000,
});

export const Route = createFileRoute("/_authenticated/admin/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(dashQO),
  component: Dashboard,
});

function Dashboard() {
  const { data } = useSuspenseQuery(dashQO);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Resumo do dia</p>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        <Card icon={<ClipboardList className="h-4 w-4" />} label="Pedidos hoje" value={String(data.today_orders.length)} />
        <Card icon={<TrendingUp className="h-4 w-4" />} label="Pendentes" value={String(data.pending)} />
        <Card icon={<Banknote className="h-4 w-4" />} label="Receita entregue" value={formatMoney(data.revenue)} />
        <Card icon={<Package className="h-4 w-4" />} label="Stock baixo" value={String(data.lowStock.length)} />
      </div>
      {data.lowStock.length > 0 && (
        <div className="rounded-xl border bg-card p-5">
          <h2 className="font-semibold">Alertas de stock</h2>
          <ul className="mt-3 divide-y">
            {data.lowStock.map((s) => (
              <li key={s.id} className="flex justify-between py-2 text-sm">
                <span>{s.name}</span>
                <span className="text-brand font-semibold">{s.quantity} (min {s.min_quantity})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Card({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-xs uppercase tracking-wider">{label}</span>
        <span className="grid h-7 w-7 place-items-center rounded-md bg-accent text-brand">{icon}</span>
      </div>
      <div className="mt-2 font-display text-2xl font-bold">{value}</div>
    </div>
  );
}

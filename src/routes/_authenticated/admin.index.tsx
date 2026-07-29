import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney } from "@/lib/format";
import { Banknote, ChevronRight, ClipboardList, Package, TrendingUp } from "lucide-react";

const dashQO = queryOptions({
  queryKey: ["admin", "dash"],
  queryFn: async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const iso = today.toISOString();
    const [orders, stock] = await Promise.all([
      supabase.from("orders").select("id, total_cents, status, created_at").gte("created_at", iso),
      supabase.from("stock_items").select("id, name, quantity, min_quantity"),
    ]);
    if (orders.error) throw orders.error;
    if (stock.error) throw stock.error;
    const today_orders = orders.data ?? [];
    const revenue = today_orders
      .filter((o) => o.status === "entregue")
      .reduce((s, o) => s + o.total_cents, 0);
    const pending = today_orders.filter(
      (o) => o.status !== "entregue" && o.status !== "cancelado",
    ).length;
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
        <Card
          to="/admin/pedidos"
          icon={<ClipboardList className="h-4 w-4" />}
          label="Pedidos hoje"
          value={String(data.today_orders.length)}
        />
        <Card
          to="/admin/pedidos"
          icon={<TrendingUp className="h-4 w-4" />}
          label="Pendentes"
          value={String(data.pending)}
        />
        <Card
          to="/admin/financeiro"
          icon={<Banknote className="h-4 w-4" />}
          label="Receita entregue"
          value={formatMoney(data.revenue)}
        />
        <Card
          to="/admin/stock"
          icon={<Package className="h-4 w-4" />}
          label="Stock baixo"
          value={String(data.lowStock.length)}
        />
      </div>
      {data.lowStock.length > 0 && (
        <div className="rounded-xl border bg-card p-5">
          <h2 className="font-semibold">Alertas de stock</h2>
          <ul className="mt-3 divide-y">
            {data.lowStock.map((s) => (
              <li key={s.id} className="flex justify-between py-2 text-sm">
                <span>{s.name}</span>
                <span className="text-brand font-semibold">
                  {s.quantity} (min {s.min_quantity})
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

type DashboardTarget = "/admin/pedidos" | "/admin/financeiro" | "/admin/stock";

function Card({
  to,
  icon,
  label,
  value,
}: {
  to: DashboardTarget;
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Link
      to={to}
      aria-label={`Abrir ${label}`}
      className="group rounded-xl border bg-card p-5 transition duration-200 hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 active:scale-[0.99]"
    >
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-xs uppercase tracking-wider">{label}</span>
        <span className="grid h-7 w-7 place-items-center rounded-md bg-accent text-brand">
          {icon}
        </span>
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <span className="font-display text-2xl font-bold">{value}</span>
        <ChevronRight
          className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-brand"
          aria-hidden="true"
        />
      </div>
    </Link>
  );
}

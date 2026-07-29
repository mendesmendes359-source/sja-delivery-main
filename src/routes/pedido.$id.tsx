import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { formatMoney, formatDate, STATUS_LABEL, STATUS_ORDER } from "@/lib/format";
import { Check } from "lucide-react";
import { useEffect } from "react";

const orderQO = (id: string) =>
  queryOptions({
    queryKey: ["order", id],
    queryFn: async () => {
      const { data: order, error } = await supabase
        .from("orders")
        .select("id, order_number, customer_name, status, total_cents, order_type, address, notes, created_at")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!order) throw notFound();
      const { data: items } = await supabase
        .from("order_items")
        .select("id, name_snapshot, quantity, unit_price_cents")
        .eq("order_id", id);
      return { order, items: items ?? [] };
    },
    refetchInterval: 15000,
  });

export const Route = createFileRoute("/pedido/$id")({
  head: () => ({
    meta: [
      { title: "Estado do pedido — SJA Fast Food" },
      { name: "description", content: "Acompanhe o estado do seu pedido em tempo real." },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: ({ params, context }) => context.queryClient.ensureQueryData(orderQO(params.id)),
  component: OrderPage,
});

function OrderPage() {
  const { id } = Route.useParams();
  const { data, refetch } = useSuspenseQuery(orderQO(id));
  useEffect(() => {
    const ch = supabase
      .channel(`order-${id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${id}` }, () => {
        refetch();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [id, refetch]);

  const { order, items } = data;
  const idx = STATUS_ORDER.indexOf(order.status as (typeof STATUS_ORDER)[number]);
  const cancelled = order.status === "cancelado";

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-3xl px-4 py-12">
        <div className="rounded-2xl border bg-card p-6 md:p-8">
          <div className="text-sm font-semibold uppercase tracking-wider text-brand">
            {cancelled ? "Pedido cancelado" : "Pedido recebido"}
          </div>
          <h1 className="mt-2 font-display text-3xl md:text-4xl font-bold">{order.order_number}</h1>
          <p className="mt-2 text-muted-foreground">
            Olá {order.customer_name} — o seu pedido foi criado em {formatDate(order.created_at)}
          </p>

          {!cancelled && (
            <div className="mt-8">
              <div className="grid grid-cols-5 gap-2">
                {STATUS_ORDER.map((s, i) => {
                  const done = i <= idx;
                  return (
                    <div key={s} className="text-center">
                      <div
                        className={`mx-auto grid h-9 w-9 place-items-center rounded-full text-sm font-bold ${
                          done ? "bg-brand text-brand-foreground" : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {done ? <Check className="h-4 w-4" /> : i + 1}
                      </div>
                      <div className={`mt-2 text-[11px] font-medium ${done ? "text-navy" : "text-muted-foreground"}`}>
                        {STATUS_LABEL[s]}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 h-1 rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-brand transition-all"
                  style={{ width: `${Math.max(0, (idx / (STATUS_ORDER.length - 1)) * 100)}%` }}
                />
              </div>
            </div>
          )}

          <div className="mt-8 rounded-lg border p-4">
            <h2 className="font-semibold">Itens</h2>
            <ul className="mt-2 divide-y">
              {items.map((it) => (
                <li key={it.id} className="flex justify-between py-2 text-sm">
                  <span>
                    {it.quantity}× {it.name_snapshot}
                  </span>
                  <span>{formatMoney(it.unit_price_cents * it.quantity)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex justify-between border-t pt-3 font-semibold">
              <span>Total</span>
              <span className="text-navy">{formatMoney(order.total_cents)}</span>
            </div>
          </div>

          <div className="mt-4 grid gap-2 text-sm text-muted-foreground">
            <div><strong className="text-foreground">Tipo:</strong> {order.order_type === "entrega" ? "Entrega ao domicílio" : "Take-away"}</div>
            {order.address && <div><strong className="text-foreground">Morada:</strong> {order.address}</div>}
            {order.notes && <div><strong className="text-foreground">Notas:</strong> {order.notes}</div>}
          </div>

          <div className="mt-6">
            <Link to="/menu" className="text-sm font-medium text-brand hover:underline">
              ← Fazer outro pedido
            </Link>
          </div>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}

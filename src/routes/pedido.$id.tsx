import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { formatMoney, formatDate, STATUS_LABEL, STATUS_ORDER } from "@/lib/format";
import { saveOrderHistoryEntry } from "@/lib/order-history";
import { PublicOrderPayloadSchema } from "@/lib/public-order";
import { Check, Clock3 } from "lucide-react";
import type { RouteLoaderArgs } from "@/router-context";

const orderQO = (id: string) =>
  queryOptions({
    queryKey: ["order", id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_public_order", { p_order_id: id });
      if (error) throw error;
      if (!data) throw notFound();
      return PublicOrderPayloadSchema.parse(data);
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
  loader: ({ params, context }: RouteLoaderArgs<{ id: string }>) =>
    context.queryClient.ensureQueryData(orderQO(params.id)),
  component: OrderPage,
});

function OrderPage() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(orderQO(id));

  const { order, items } = data;
  const idx = order.status === "cancelado" ? -1 : STATUS_ORDER.indexOf(order.status);
  const cancelled = order.status === "cancelado";
  const deliveryTimeDefined = Boolean(order.estimated_delivery_at);

  useEffect(() => {
    saveOrderHistoryEntry({
      id: order.id,
      order_number: order.order_number,
      total_cents: order.total_cents,
      order_type: order.order_type,
      created_at: order.created_at,
    });
  }, [order.created_at, order.id, order.order_number, order.order_type, order.total_cents]);

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
                      <div
                        className={`mt-2 text-[11px] font-medium ${done ? "text-navy" : "text-muted-foreground"}`}
                      >
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

          {cancelled && order.cancellation_reason ? (
            <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-900">
              <p className="text-xs font-semibold uppercase tracking-wide">
                Motivo do cancelamento
              </p>
              <p className="mt-1 text-sm">{order.cancellation_reason}</p>
            </div>
          ) : null}

          {order.order_type === "entrega" &&
          order.estimated_delivery_at &&
          !cancelled &&
          order.status !== "entregue" ? (
            <div className="mt-6 flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-blue-900">
              <Clock3 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide">Entrega marcada</p>
                <p className="mt-1 font-medium">{formatDate(order.estimated_delivery_at)}</p>
                <p className="mt-1 text-xs text-blue-700">
                  Este horário é definitivo e não pode ser alterado.
                </p>
              </div>
            </div>
          ) : null}

          {order.order_type === "entrega" &&
          !deliveryTimeDefined &&
          !cancelled &&
          order.status !== "entregue" ? (
            <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
              <p className="text-xs font-semibold uppercase tracking-wide">Horário em definição</p>
              <p className="mt-1 text-sm">
                A taxa de entrega já está incluída. A equipa ainda vai indicar o horário.
              </p>
            </div>
          ) : null}

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
            <div className="mt-3 space-y-2 border-t pt-3 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Produtos</span>
                <span>{formatMoney(order.subtotal_cents)}</span>
              </div>
              {order.order_type === "entrega" ? (
                <div className="flex justify-between text-muted-foreground">
                  <span>Taxa de entrega</span>
                  <span>{formatMoney(order.delivery_fee_cents)}</span>
                </div>
              ) : null}
              <div className="flex justify-between border-t pt-2 font-semibold">
                <span>Total</span>
                <span className="text-navy">{formatMoney(order.total_cents)}</span>
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-2 text-sm text-muted-foreground">
            <div>
              <strong className="text-foreground">Tipo:</strong>{" "}
              {order.order_type === "entrega" ? "Entrega ao domicílio" : "Take-away"}
            </div>
            {order.address && (
              <div>
                <strong className="text-foreground">Morada:</strong> {order.address}
              </div>
            )}
            {order.delivery_zone_name ? (
              <div>
                <strong className="text-foreground">Localização:</strong> {order.delivery_zone_name}
              </div>
            ) : null}
            {order.notes && (
              <div>
                <strong className="text-foreground">Notas:</strong> {order.notes}
              </div>
            )}
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

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Clock3, History, RefreshCw, Trash2 } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, formatMoney, STATUS_LABEL } from "@/lib/format";
import { clearOrderHistory, removeOrderHistoryEntry, useOrderHistory } from "@/lib/order-history";
import { PublicOrderPayloadSchema, type PublicOrderPayload } from "@/lib/public-order";

export const Route = createFileRoute("/meus-pedidos")({
  head: () => ({
    meta: [
      { title: "Meus pedidos — SJA Fast Food" },
      {
        name: "description",
        content: "Consulte o histórico e o estado atual dos seus pedidos neste dispositivo.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OrderHistoryPage,
});

type LiveOrder = {
  id: string;
  payload: PublicOrderPayload | null;
};

const STATUS_STYLES: Record<PublicOrderPayload["order"]["status"], string> = {
  pendente: "bg-amber-100 text-amber-800",
  aceite: "bg-blue-100 text-blue-800",
  em_preparacao: "bg-violet-100 text-violet-800",
  saiu_entrega: "bg-cyan-100 text-cyan-800",
  entregue: "bg-emerald-100 text-emerald-800",
  cancelado: "bg-red-100 text-red-800",
};

function OrderHistoryPage() {
  const history = useOrderHistory();
  const orderIds = history.map((entry) => entry.id);
  const liveOrders = useQuery({
    queryKey: ["customer", "order-history", orderIds],
    enabled: orderIds.length > 0,
    queryFn: async (): Promise<LiveOrder[]> =>
      Promise.all(
        orderIds.map(async (id) => {
          const saved = history.find((entry) => entry.id === id);
          if (!saved) return { id, payload: null };
          const { data, error } = await supabase.rpc("get_public_order", {
            p_order_id: id,
            p_tracking_token: saved.tracking_token,
          });
          if (error || !data) return { id, payload: null };
          const parsed = PublicOrderPayloadSchema.safeParse(data);
          return { id, payload: parsed.success ? parsed.data : null };
        }),
      ),
    refetchInterval: 30000,
  });
  const liveById = new Map(
    (liveOrders.data ?? []).map(({ id, payload }) => [id, payload] as const),
  );

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-4 py-12">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-brand">
              Neste dispositivo
            </p>
            <h1 className="mt-2 font-display text-3xl font-bold md:text-4xl">Meus pedidos</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Este histórico fica guardado apenas neste navegador. Abra um link de acompanhamento
              neste dispositivo para o adicionar à lista.
            </p>
          </div>
          {history.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                if (window.confirm("Remover todos os pedidos guardados neste dispositivo?")) {
                  clearOrderHistory();
                }
              }}
              className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium text-muted-foreground hover:border-red-300 hover:text-red-700"
            >
              <Trash2 aria-hidden="true" className="h-4 w-4" />
              Limpar histórico
            </button>
          ) : null}
        </div>

        {history.length === 0 ? (
          <div className="mt-8 rounded-2xl border bg-card p-8 text-center">
            <History aria-hidden="true" className="mx-auto h-10 w-10 text-muted-foreground" />
            <h2 className="mt-4 font-display text-xl font-semibold">Ainda não há pedidos</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Os próximos pedidos aparecerão aqui automaticamente depois da confirmação.
            </p>
            <Link
              to="/menu"
              className="mt-5 inline-flex rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground"
            >
              Ver o menu
            </Link>
          </div>
        ) : (
          <div className="mt-8 space-y-4">
            {history.map((saved) => {
              const live = liveById.get(saved.id);
              const order = live?.order;
              const status = order?.status;
              return (
                <article key={saved.id} className="rounded-2xl border bg-card p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="font-mono text-xs font-semibold text-muted-foreground">
                        {order?.order_number ?? saved.order_number}
                      </p>
                      <h2 className="mt-1 font-display text-xl font-semibold">
                        {order?.order_type === "entrega" ||
                        (!order && saved.order_type === "entrega")
                          ? "Entrega"
                          : "Take-away"}
                      </h2>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDate(order?.created_at ?? saved.created_at)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-display text-lg font-semibold">
                        {formatMoney(order?.total_cents ?? saved.total_cents)}
                      </p>
                      {status ? (
                        <span
                          className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[status]}`}
                        >
                          {STATUS_LABEL[status]}
                        </span>
                      ) : liveOrders.isFetching ? (
                        <span className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <RefreshCw aria-hidden="true" className="h-3 w-3 animate-spin" />A
                          atualizar
                        </span>
                      ) : (
                        <span className="mt-2 text-xs text-muted-foreground">Resumo guardado</span>
                      )}
                    </div>
                  </div>

                  {status === "cancelado" && order?.cancellation_reason ? (
                    <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                      <span className="font-semibold">Motivo: </span>
                      {order.cancellation_reason}
                    </div>
                  ) : null}

                  {order?.order_type === "entrega" &&
                  order.estimated_delivery_at &&
                  status !== "cancelado" &&
                  status !== "entregue" ? (
                    <div className="mt-4 flex items-center gap-2 rounded-xl bg-blue-50 p-3 text-sm text-blue-900">
                      <Clock3 aria-hidden="true" className="h-4 w-4 shrink-0" />
                      <span>
                        Entrega marcada: <strong>{formatDate(order.estimated_delivery_at)}</strong>
                      </span>
                    </div>
                  ) : null}

                  {order?.order_type === "entrega" &&
                  !order.estimated_delivery_at &&
                  status !== "cancelado" &&
                  status !== "entregue" ? (
                    <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs font-medium text-amber-800">
                      Taxa incluída; horário da entrega ainda por definir.
                    </p>
                  ) : null}

                  {order?.order_type === "entrega" && order.delivery_fee_cents > 0 ? (
                    <p className="mt-3 text-xs text-muted-foreground">
                      Inclui {formatMoney(order.delivery_fee_cents)} de taxa de entrega.
                    </p>
                  ) : null}

                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                    <Link
                      to="/pedido/$id"
                      params={{ id: saved.id }}
                      search={{ token: saved.tracking_token }}
                      className="text-sm font-semibold text-brand hover:underline"
                    >
                      Ver acompanhamento
                    </Link>
                    <button
                      type="button"
                      aria-label={`Remover o pedido ${saved.order_number} do histórico`}
                      onClick={() => removeOrderHistoryEntry(saved.id)}
                      className="text-xs font-medium text-muted-foreground hover:text-red-700"
                    >
                      Remover deste dispositivo
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Bike, CheckCircle2, Truck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, formatMoney } from "@/lib/format";
import type { RouteLoaderArgs } from "@/router-context";

const DELIVERY_STATUS_LABEL: Record<string, string> = {
  atribuido: "Atribuída",
  em_transito: "Em trânsito",
  entregue: "Entregue",
};

const deliveryQO = queryOptions({
  queryKey: ["admin", "deliveries"],
  queryFn: async () => {
    const [ordersResult, deliveriesResult, couriersResult] = await Promise.all([
      supabase
        .from("orders")
        .select(
          "id, order_number, customer_name, customer_phone, address, status, total_cents, created_at",
        )
        .eq("order_type", "entrega")
        .in("status", ["aceite", "em_preparacao", "saiu_entrega", "entregue"])
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("deliveries")
        .select("id, order_id, courier_id, courier_name, status, dispatched_at, delivered_at"),
      supabase.rpc("list_couriers"),
    ]);

    if (ordersResult.error) throw ordersResult.error;
    if (deliveriesResult.error) throw deliveriesResult.error;
    if (couriersResult.error) throw couriersResult.error;

    return {
      orders: ordersResult.data ?? [],
      deliveries: deliveriesResult.data ?? [],
      couriers: couriersResult.data ?? [],
    };
  },
  refetchInterval: 15000,
});

export const Route = createFileRoute("/_authenticated/admin/entregas")({
  loader: ({ context }: RouteLoaderArgs) => context.queryClient.ensureQueryData(deliveryQO),
  component: DeliveriesAdmin,
});

function DeliveriesAdmin() {
  const { data } = useSuspenseQuery(deliveryQO);
  const queryClient = useQueryClient();
  const [selections, setSelections] = useState<Record<string, string>>({});
  const deliveryByOrderId = useMemo(
    () => new Map(data.deliveries.map((delivery) => [delivery.order_id, delivery])),
    [data.deliveries],
  );

  const assignMutation = useMutation({
    mutationFn: async (input: { orderId: string; courierId: string }) => {
      const { error } = await supabase.rpc("assign_delivery", {
        p_order_id: input.orderId,
        p_courier_id: input.courierId,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "deliveries"] });
      toast.success("Entrega atribuída ao estafeta");
    },
    onError: showError,
  });

  const statusMutation = useMutation({
    mutationFn: async (input: { deliveryId: string; status: "em_transito" | "entregue" }) => {
      const { error } = await supabase.rpc("update_delivery_status", {
        p_delivery_id: input.deliveryId,
        p_status: input.status,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "deliveries"] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "orders"] }),
      ]);
      toast.success("Estado da entrega atualizado");
    },
    onError: showError,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Entregas</h1>
        <p className="text-sm text-muted-foreground">Atribua cada pedido a uma conta de estafeta</p>
      </div>

      {data.couriers.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-5 text-sm text-muted-foreground">
          Crie ou altere um utilizador para a função “Estafeta” antes de atribuir entregas.
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {data.orders.map((order) => {
          const delivery = deliveryByOrderId.get(order.id);
          const selectedCourierId =
            selections[order.id] ?? delivery?.courier_id ?? data.couriers[0]?.user_id ?? "";

          return (
            <article key={order.id} className="rounded-xl border bg-card p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-mono text-xs text-muted-foreground">
                    {order.order_number}
                  </div>
                  <div className="font-semibold">{order.customer_name}</div>
                  <a
                    href={`tel:${order.customer_phone}`}
                    className="text-sm text-muted-foreground hover:text-foreground"
                  >
                    {order.customer_phone}
                  </a>
                  <div className="mt-1 text-sm">{order.address}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-semibold">{formatMoney(order.total_cents)}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatDate(order.created_at)}
                  </div>
                  <div className="mt-1 inline-block rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-brand">
                    {delivery
                      ? (DELIVERY_STATUS_LABEL[delivery.status] ?? delivery.status)
                      : "Sem atribuição"}
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
                <label className="text-xs font-medium text-muted-foreground">
                  Estafeta responsável
                  <select
                    value={selectedCourierId}
                    disabled={data.couriers.length === 0 || assignMutation.isPending}
                    onChange={(event) =>
                      setSelections((current) => ({
                        ...current,
                        [order.id]: event.target.value,
                      }))
                    }
                    className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground disabled:opacity-60"
                  >
                    {data.couriers.map((courier) => (
                      <option key={courier.user_id} value={courier.user_id}>
                        {courier.display_name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  disabled={!selectedCourierId || assignMutation.isPending}
                  onClick={() =>
                    assignMutation.mutate({
                      orderId: order.id,
                      courierId: selectedCourierId,
                    })
                  }
                  className="self-end rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
                >
                  {delivery?.courier_id === selectedCourierId ? "Reatribuir" : "Atribuir"}
                </button>
              </div>

              {delivery ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Bike className="h-4 w-4" aria-hidden="true" />
                    {delivery.courier_name ?? "Estafeta por associar"}
                  </span>

                  {delivery.status === "atribuido" ? (
                    <button
                      type="button"
                      disabled={statusMutation.isPending}
                      onClick={() =>
                        statusMutation.mutate({
                          deliveryId: delivery.id,
                          status: "em_transito",
                        })
                      }
                      className="ml-auto inline-flex items-center gap-2 rounded-md bg-navy px-3 py-2 text-sm text-navy-foreground disabled:opacity-50"
                    >
                      <Truck className="h-4 w-4" aria-hidden="true" />
                      Saiu para entrega
                    </button>
                  ) : null}

                  {delivery.status === "em_transito" ? (
                    <button
                      type="button"
                      disabled={statusMutation.isPending}
                      onClick={() =>
                        statusMutation.mutate({
                          deliveryId: delivery.id,
                          status: "entregue",
                        })
                      }
                      className="ml-auto inline-flex items-center gap-2 rounded-md bg-brand px-3 py-2 text-sm text-brand-foreground disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      Confirmar entrega
                    </button>
                  ) : null}
                </div>
              ) : null}
            </article>
          );
        })}

        {data.orders.length === 0 ? (
          <p className="text-muted-foreground">Sem entregas ativas.</p>
        ) : null}
      </div>
    </div>
  );
}

function showError(error: unknown) {
  toast.error(error instanceof Error ? error.message : "Não foi possível atualizar a entrega");
}

import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Bike, CheckCircle2, Clock3, LogOut, MapPin, Phone, Truck, UserRound } from "lucide-react";
import { toast } from "sonner";
import { BrandLogo } from "@/components/brand-logo";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, formatMoney } from "@/lib/format";
import type { RouteLoaderArgs } from "@/router-context";

const courierDeliveriesQO = queryOptions({
  queryKey: ["courier", "deliveries"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("deliveries")
      .select(
        "id, status, dispatched_at, delivered_at, created_at, orders!inner(id, order_number, customer_name, customer_phone, address, notes, status, total_cents, estimated_delivery_at, created_at)",
      )
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data ?? [];
  },
  refetchInterval: 15000,
});

export const Route = createFileRoute("/_authenticated/estafeta")({
  beforeLoad: async ({ context }) => {
    const { data: isCourier, error } = await supabase.rpc("is_courier", {
      _user_id: context.user.id,
    });

    if (error || !isCourier) throw redirect({ to: "/admin" });
  },
  loader: ({ context }: RouteLoaderArgs) =>
    context.queryClient.ensureQueryData(courierDeliveriesQO),
  head: () => ({
    meta: [
      { title: "Minhas entregas — SJA Fast Food" },
      {
        name: "description",
        content: "Área reservada aos estafetas do SJA Fast Food.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CourierArea,
});

function CourierArea() {
  const { data } = useSuspenseQuery(courierDeliveriesQO);
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const displayName =
    typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name
      : (user.email ?? "Estafeta");
  const activeDeliveries = data.filter(
    (delivery) => delivery.status !== "entregue" && delivery.orders.status !== "cancelado",
  ).length;
  const completedDeliveries = data.filter((delivery) => delivery.status === "entregue").length;

  const statusMutation = useMutation({
    mutationFn: async (input: { deliveryId: string; status: "em_transito" | "entregue" }) => {
      const { error } = await supabase.rpc("update_delivery_status", {
        p_delivery_id: input.deliveryId,
        p_status: input.status,
      });
      if (error) throw error;
    },
    onSuccess: async (_, input) => {
      await queryClient.invalidateQueries({ queryKey: ["courier", "deliveries"] });
      toast.success(
        input.status === "em_transito" ? "Saída para entrega registada" : "Entrega concluída",
      );
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar"),
  });

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <BrandLogo className="h-10 w-10 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <div className="truncate font-display font-bold">SJA · Estafeta</div>
              <div className="truncate text-xs text-muted-foreground">{displayName}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={signOut}
            className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sair
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        <section className="grid gap-4 sm:grid-cols-3">
          <Summary
            icon={<UserRound className="h-5 w-5" aria-hidden="true" />}
            label="Perfil"
            value="Estafeta"
          />
          <Summary
            icon={<Bike className="h-5 w-5" aria-hidden="true" />}
            label="Ativas"
            value={String(activeDeliveries)}
          />
          <Summary
            icon={<CheckCircle2 className="h-5 w-5" aria-hidden="true" />}
            label="Concluídas"
            value={String(completedDeliveries)}
          />
        </section>

        <section>
          <div className="mb-4">
            <h1 className="font-display text-2xl font-bold">Minhas entregas</h1>
            <p className="text-sm text-muted-foreground">
              Apenas os pedidos atribuídos ao seu perfil aparecem aqui.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {data.map((delivery) => {
              const order = delivery.orders;
              const isCancelled = order.status === "cancelado";
              const canStartDelivery =
                order.status === "em_preparacao" && Boolean(order.estimated_delivery_at);

              return (
                <article key={delivery.id} className="rounded-2xl border bg-card p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {order.order_number}
                      </div>
                      <h2 className="font-display text-lg font-bold">{order.customer_name}</h2>
                    </div>
                    <StatusBadge status={isCancelled ? "cancelado" : delivery.status} />
                  </div>

                  <div className="mt-4 space-y-3 text-sm">
                    <a
                      href={`tel:${order.customer_phone}`}
                      className="flex items-center gap-2 rounded-md border p-3 hover:bg-muted"
                    >
                      <Phone className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                      <span>{order.customer_phone}</span>
                    </a>
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.address ?? "")}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-start gap-2 rounded-md border p-3 hover:bg-muted"
                    >
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                      <span>{order.address ?? "Morada não indicada"}</span>
                    </a>
                  </div>

                  {order.notes ? (
                    <div className="mt-3 rounded-md bg-muted p-3 text-sm">
                      <span className="font-medium">Nota:</span> {order.notes}
                    </div>
                  ) : null}

                  {order.estimated_delivery_at && !isCancelled ? (
                    <div className="mt-3 flex items-center gap-2 rounded-md bg-accent p-3 text-sm text-brand">
                      <Clock3 className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>
                        Horário definido: <strong>{formatDate(order.estimated_delivery_at)}</strong>
                      </span>
                    </div>
                  ) : null}

                  {!order.estimated_delivery_at && !isCancelled ? (
                    <div className="mt-3 rounded-md bg-amber-50 p-3 text-sm font-medium text-amber-800">
                      Horário ainda não definido pela gestão. A taxa já está incluída no total.
                    </div>
                  ) : null}

                  {order.estimated_delivery_at &&
                  order.status !== "em_preparacao" &&
                  delivery.status === "atribuido" &&
                  !isCancelled ? (
                    <div className="mt-3 rounded-md bg-amber-50 p-3 text-sm font-medium text-amber-800">
                      Aguarde até a gestão colocar o pedido em preparação.
                    </div>
                  ) : null}

                  <div className="mt-4 flex items-center justify-between border-t pt-4">
                    <div>
                      <div className="font-semibold">{formatMoney(order.total_cents)}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatDate(order.created_at)}
                      </div>
                    </div>

                    {!isCancelled && delivery.status === "atribuido" ? (
                      <button
                        type="button"
                        disabled={statusMutation.isPending || !canStartDelivery}
                        title={
                          !order.estimated_delivery_at
                            ? "A gestão deve definir o preço e o horário primeiro"
                            : order.status !== "em_preparacao"
                              ? "A gestão deve colocar primeiro o pedido em preparação"
                              : undefined
                        }
                        onClick={() =>
                          statusMutation.mutate({
                            deliveryId: delivery.id,
                            status: "em_transito",
                          })
                        }
                        className="inline-flex items-center gap-2 rounded-md bg-navy px-4 py-2 text-sm font-semibold text-navy-foreground disabled:opacity-50"
                      >
                        <Truck className="h-4 w-4" aria-hidden="true" />
                        Iniciar entrega
                      </button>
                    ) : null}

                    {!isCancelled && delivery.status === "em_transito" ? (
                      <button
                        type="button"
                        disabled={statusMutation.isPending}
                        onClick={() =>
                          statusMutation.mutate({
                            deliveryId: delivery.id,
                            status: "entregue",
                          })
                        }
                        className="inline-flex items-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground disabled:opacity-50"
                      >
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                        Confirmar entrega
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>

          {data.length === 0 ? (
            <div className="rounded-2xl border border-dashed bg-card p-10 text-center">
              <Clock3 className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden="true" />
              <h2 className="mt-3 font-display text-lg font-bold">Sem entregas atribuídas</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Os novos pedidos aparecerão aqui assim que forem atribuídos.
              </p>
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}

function Summary({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-accent text-brand">
          {icon}
        </span>
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="font-display text-xl font-bold">{value}</div>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const content =
    status === "atribuido"
      ? { label: "Atribuída", className: "bg-accent text-brand" }
      : status === "em_transito"
        ? { label: "Em trânsito", className: "bg-blue-100 text-blue-800" }
        : status === "entregue"
          ? { label: "Entregue", className: "bg-emerald-100 text-emerald-800" }
          : { label: "Cancelado", className: "bg-muted text-muted-foreground" };

  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${content.className}`}>
      {content.label}
    </span>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Bike,
  CalendarDays,
  CheckCircle2,
  Clock3,
  MapPin,
  Phone,
  Save,
  Settings2,
  Truck,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AppSelect } from "@/components/ui/app-select";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, formatMoney } from "@/lib/format";
import type { RouteLoaderArgs } from "@/router-context";

const DELIVERY_STATUS_LABEL: Record<string, string> = {
  atribuido: "Atribuída",
  em_transito: "Em trânsito",
  entregue: "Entregue",
};

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, hour) => {
  const value = String(hour).padStart(2, "0");
  return { value, label: value };
});

const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, minute) => {
  const value = String(minute).padStart(2, "0");
  return { value, label: value };
});

const deliveryQO = queryOptions({
  queryKey: ["admin", "deliveries"],
  queryFn: async () => {
    const [ordersResult, deliveriesResult, couriersResult] = await Promise.all([
      supabase
        .from("orders")
        .select(
          "id, order_number, customer_name, customer_phone, address, status, subtotal_cents, delivery_fee_cents, total_cents, estimated_delivery_at, created_at",
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
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [feeSelections, setFeeSelections] = useState<Record<string, string>>({});
  const [timeSelections, setTimeSelections] = useState<Record<string, string>>({});
  const deliveryByOrderId = useMemo(
    () => new Map(data.deliveries.map((delivery) => [delivery.order_id, delivery])),
    [data.deliveries],
  );
  const courierOptions = useMemo(
    () =>
      data.couriers.map((courier) => ({
        value: courier.user_id,
        label: courier.display_name,
      })),
    [data.couriers],
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

  const termsMutation = useMutation({
    mutationFn: async (input: {
      orderId: string;
      deliveryFeeKz: string;
      deliveryTime: string;
      orderCreatedAt: string;
      lockedEstimate: string | null;
    }) => {
      const deliveryFee = Number(input.deliveryFeeKz);
      if (!Number.isFinite(deliveryFee) || deliveryFee < 0 || deliveryFee > 1000000) {
        throw new Error("Indique um preço de entrega entre 0 e 1 000 000 Kz");
      }

      const estimatedAt = input.lockedEstimate
        ? new Date(input.lockedEstimate)
        : createDeliveryDateTime(input.orderCreatedAt, input.deliveryTime);

      const { error } = await supabase.rpc("set_order_delivery_terms", {
        p_order_id: input.orderId,
        p_delivery_fee_cents: Math.round(deliveryFee * 100),
        p_estimated_delivery_at: estimatedAt.toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: async (_, input) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "deliveries"] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "orders"] }),
      ]);
      toast.success(
        input.lockedEstimate
          ? "Preço atualizado; o horário foi mantido"
          : "Preço e horário da entrega definidos",
      );
    },
    onError: showError,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Entregas</h1>
        <p className="text-sm text-muted-foreground">
          Defina o horário e o preço de cada pedido e atribua um estafeta
        </p>
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
          const editorOpen = selectedOrderId === order.id;
          const deliveryTime =
            timeSelections[order.id] ?? toTimeInputValue(order.estimated_delivery_at);
          const [deliveryHour = "", deliveryMinute = ""] = deliveryTime.split(":");
          const deliveryFeeInput =
            feeSelections[order.id] ?? String(order.delivery_fee_cents / 100);
          const previewDeliveryFeeCents = getDeliveryFeePreviewCents(deliveryFeeInput);
          const previewTotalCents = order.subtotal_cents + previewDeliveryFeeCents;

          return (
            <Dialog
              key={order.id}
              open={editorOpen}
              onOpenChange={(open) => setSelectedOrderId(open ? order.id : null)}
            >
              <article
                className={`rounded-xl border bg-card p-5 shadow-sm transition-colors ${
                  editorOpen ? "border-brand ring-2 ring-brand/15" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="font-mono text-xs text-muted-foreground">
                      {order.order_number}
                    </div>
                    <h2 className="truncate font-semibold">{order.customer_name}</h2>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-brand">
                        {delivery
                          ? (DELIVERY_STATUS_LABEL[delivery.status] ?? delivery.status)
                          : "Sem atribuição"}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          order.estimated_delivery_at
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {order.estimated_delivery_at ? "Entrega definida" : "Por definir"}
                      </span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-semibold">{formatMoney(order.total_cents)}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(order.created_at)}
                    </div>
                  </div>
                </div>

                {order.estimated_delivery_at ? (
                  <div className="mt-4 flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm">
                    <Clock3 className="h-4 w-4 text-brand" aria-hidden="true" />
                    <span>
                      Entrega às <strong>{formatDeliveryTime(order.estimated_delivery_at)}</strong>
                    </span>
                  </div>
                ) : null}

                <DialogTrigger asChild>
                  <button
                    type="button"
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm font-semibold hover:bg-muted"
                  >
                    <Settings2 className="h-4 w-4" aria-hidden="true" />
                    {order.estimated_delivery_at ? "Ver definição" : "Definir entrega"}
                  </button>
                </DialogTrigger>
              </article>

              <DialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-5xl overflow-y-auto rounded-2xl border-brand/30 p-0">
                <DialogHeader className="border-b px-6 pb-4 pt-6 pr-14">
                  <div className="text-xs font-semibold uppercase tracking-wider text-brand">
                    Definição da entrega
                  </div>
                  <DialogTitle className="font-display text-xl">
                    {order.order_number} · {order.customer_name}
                  </DialogTitle>
                  <DialogDescription>
                    Defina o preço, o horário e o estafeta responsável por este pedido.
                  </DialogDescription>
                </DialogHeader>

                <div className="px-6 pb-6">
                  <div className="mt-4 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                    <a
                      href={`tel:${order.customer_phone}`}
                      className="inline-flex items-center gap-2 rounded-lg border p-3 hover:text-foreground"
                    >
                      <Phone className="h-4 w-4 text-brand" aria-hidden="true" />
                      {order.customer_phone}
                    </a>
                    <div className="flex items-start gap-2 rounded-lg border p-3">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                      <span>{order.address}</span>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border bg-muted/30 p-3">
                      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                        <CalendarDays className="h-4 w-4" aria-hidden="true" />
                        Data da entrega
                      </div>
                      <div className="mt-1 font-semibold">
                        {formatDeliveryDay(order.created_at)}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Definida automaticamente pela data do pedido.
                      </p>
                    </div>

                    <div
                      role="group"
                      aria-labelledby={`delivery-time-label-${order.id}`}
                      className="rounded-lg border bg-muted/30 p-3 text-xs font-medium text-muted-foreground"
                    >
                      <span
                        id={`delivery-time-label-${order.id}`}
                        className="flex items-center gap-2"
                      >
                        <Clock3 className="h-4 w-4" aria-hidden="true" />
                        Horário da entrega
                      </span>

                      <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                        <AppSelect
                          value={deliveryHour}
                          onValueChange={(hour) =>
                            setTimeSelections((current) => ({
                              ...current,
                              [order.id]: replaceDeliveryTimePart(deliveryTime, "hour", hour),
                            }))
                          }
                          options={HOUR_OPTIONS}
                          ariaLabel="Hora da entrega"
                          placeholder="Hora"
                          disabled={Boolean(order.estimated_delivery_at) || termsMutation.isPending}
                        />
                        <span className="text-base font-bold text-foreground" aria-hidden="true">
                          :
                        </span>
                        <AppSelect
                          value={deliveryMinute}
                          onValueChange={(minute) =>
                            setTimeSelections((current) => ({
                              ...current,
                              [order.id]: replaceDeliveryTimePart(deliveryTime, "minute", minute),
                            }))
                          }
                          options={MINUTE_OPTIONS}
                          ariaLabel="Minuto da entrega"
                          placeholder="Minuto"
                          disabled={Boolean(order.estimated_delivery_at) || termsMutation.isPending}
                        />
                      </div>

                      <span className="mt-1 block text-xs">
                        {order.estimated_delivery_at
                          ? "Horário fixado e protegido contra alterações."
                          : "Formato 24h. Após guardar, não poderá ser alterado."}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                    <label className="text-xs font-medium text-muted-foreground">
                      Preço desta entrega (Kz)
                      <input
                        type="number"
                        min="0"
                        max="1000000"
                        step="1"
                        value={deliveryFeeInput}
                        disabled={order.status === "entregue" || termsMutation.isPending}
                        onChange={(event) =>
                          setFeeSelections((current) => ({
                            ...current,
                            [order.id]: event.target.value,
                          }))
                        }
                        className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground disabled:opacity-60"
                      />
                    </label>

                    <label className="text-xs font-medium text-muted-foreground">
                      Estafeta responsável
                      <AppSelect
                        value={selectedCourierId}
                        disabled={data.couriers.length === 0 || assignMutation.isPending}
                        onValueChange={(courierId) =>
                          setSelections((current) => ({
                            ...current,
                            [order.id]: courierId,
                          }))
                        }
                        options={courierOptions}
                        ariaLabel="Estafeta responsável"
                        placeholder="Escolher estafeta"
                        className="mt-1"
                      />
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

                  <div className="mt-4 rounded-xl border bg-muted/30 p-4">
                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <div>
                        <div className="text-xs text-muted-foreground">Produtos</div>
                        <div className="mt-1 font-semibold">
                          {formatMoney(order.subtotal_cents)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Entrega</div>
                        <div className="mt-1 font-semibold">
                          {formatMoney(previewDeliveryFeeCents)}
                        </div>
                      </div>
                      <div className="border-l pl-3 text-right">
                        <div className="text-xs text-muted-foreground">Total da encomenda</div>
                        <div className="mt-1 font-bold text-brand">
                          {formatMoney(previewTotalCents)}
                        </div>
                      </div>
                    </div>
                    <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
                      O preço da entrega é somado automaticamente ao valor dos produtos.
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={
                      order.status === "entregue" ||
                      termsMutation.isPending ||
                      (!order.estimated_delivery_at && !isValidDeliveryTime(deliveryTime))
                    }
                    onClick={() =>
                      termsMutation.mutate({
                        orderId: order.id,
                        deliveryFeeKz: deliveryFeeInput,
                        deliveryTime,
                        orderCreatedAt: order.created_at,
                        lockedEstimate: order.estimated_delivery_at,
                      })
                    }
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground disabled:opacity-50"
                  >
                    <Save className="h-4 w-4" aria-hidden="true" />
                    {termsMutation.isPending
                      ? "A guardar..."
                      : order.estimated_delivery_at
                        ? "Guardar novo preço"
                        : "Guardar preço e horário"}
                  </button>

                  {order.estimated_delivery_at ? (
                    <p className="mt-2 text-xs text-emerald-700">
                      Entrega definida para {formatDeliveryDay(order.created_at)} às{" "}
                      {formatDeliveryTime(order.estimated_delivery_at)} ·{" "}
                      {formatMoney(order.delivery_fee_cents)}
                    </p>
                  ) : (
                    <p className="mt-2 text-xs font-medium text-amber-700">
                      Defina o preço e o horário antes de iniciar esta entrega.
                    </p>
                  )}

                  {delivery ? (
                    <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4">
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Bike className="h-4 w-4" aria-hidden="true" />
                        {delivery.courier_name ?? "Estafeta por associar"}
                      </span>

                      {delivery.status === "atribuido" ? (
                        <button
                          type="button"
                          disabled={statusMutation.isPending || !order.estimated_delivery_at}
                          title={
                            order.estimated_delivery_at
                              ? undefined
                              : "Defina o preço e o horário primeiro"
                          }
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
                </div>
              </DialogContent>
            </Dialog>
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

function getDeliveryFeePreviewCents(value: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return 0;
  return Math.round(amount * 100);
}

function createDeliveryDateTime(orderCreatedAt: string, time: string) {
  if (!isValidDeliveryTime(time)) {
    throw new Error("Indique um horário válido");
  }

  const deliveryDate = new Date(`${getLuandaDateKey(orderCreatedAt)}T${time}:00+01:00`);
  if (Number.isNaN(deliveryDate.getTime())) throw new Error("Indique um horário válido");
  return deliveryDate;
}

function isValidDeliveryTime(time: string) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time);
}

function replaceDeliveryTimePart(currentTime: string, part: "hour" | "minute", value: string) {
  const [hour = "", minute = ""] = currentTime.split(":");
  return part === "hour" ? `${value}:${minute}` : `${hour}:${value}`;
}

function getLuandaDateKey(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Luanda",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";

  return `${part("year")}-${part("month")}-${part("day")}`;
}

function formatDeliveryDay(value: string) {
  return new Intl.DateTimeFormat("pt-AO", {
    timeZone: "Africa/Luanda",
    dateStyle: "long",
  }).format(new Date(value));
}

function formatDeliveryTime(value: string) {
  return new Intl.DateTimeFormat("pt-AO", {
    timeZone: "Africa/Luanda",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function toTimeInputValue(value: string | null) {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Luanda",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";

  return `${part("hour")}:${part("minute")}`;
}

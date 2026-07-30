import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { updateOrderStatus } from "@/lib/orders.functions";
import { formatMoney, formatDate, STATUS_LABEL } from "@/lib/format";
import { useState } from "react";
import { toast } from "sonner";
import { ChevronRight, MapPin, Phone } from "lucide-react";
import type { RouteLoaderArgs } from "@/router-context";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const ordersQO = queryOptions({
  queryKey: ["admin", "orders"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("orders")
      .select(
        "id, order_number, customer_name, customer_phone, address, status, cancellation_reason, order_type, total_cents, notes, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return data ?? [];
  },
  refetchInterval: 15000,
});

export const Route = createFileRoute("/_authenticated/admin/pedidos")({
  loader: ({ context }: RouteLoaderArgs) => context.queryClient.ensureQueryData(ordersQO),
  component: OrdersAdmin,
});

const STATUSES = [
  "pendente",
  "aceite",
  "em_preparacao",
  "saiu_entrega",
  "entregue",
  "cancelado",
] as const;

const STATUS_STYLES: Record<(typeof STATUSES)[number], string> = {
  pendente: "bg-amber-100 text-amber-800",
  aceite: "bg-blue-100 text-blue-800",
  em_preparacao: "bg-violet-100 text-violet-800",
  saiu_entrega: "bg-cyan-100 text-cyan-800",
  entregue: "bg-emerald-100 text-emerald-800",
  cancelado: "bg-red-100 text-red-800",
};

function OrdersAdmin() {
  const { data } = useSuspenseQuery(ordersQO);
  const [filter, setFilter] = useState<string>("todos");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [cancellationDraft, setCancellationDraft] = useState<{
    orderId: string;
    orderNumber: string;
    reason: string;
  } | null>(null);
  const qc = useQueryClient();
  const updateFn = useServerFn(updateOrderStatus);
  const mut = useMutation({
    mutationFn: (v: {
      order_id: string;
      status: (typeof STATUSES)[number];
      cancellation_reason?: string | null;
    }) => updateFn({ data: v }),
    onSuccess: (result) => {
      qc.setQueryData<typeof data>(["admin", "orders"], (orders) =>
        orders?.map((order) =>
          order.id === result.id
            ? {
                ...order,
                status: result.status,
                cancellation_reason: result.cancellation_reason,
              }
            : order,
        ),
      );
      qc.invalidateQueries({ queryKey: ["admin", "orders"] });
      qc.invalidateQueries({ queryKey: ["admin", "sms"] });
      setCancellationDraft(null);
      toast.success("Estado atualizado");
      if (result.notifications?.adminMissingPhone) {
        toast.warning("Defina o número do administrador no módulo SMS");
      } else if (result.notifications?.skipped) {
        toast.warning("SMS registado, mas o Twilio ainda não está configurado");
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const filtered = filter === "todos" ? data : data.filter((o) => o.status === filter);
  const selectedOrder = data.find((order) => order.id === selectedOrderId) ?? null;
  const requestStatusChange = (order: (typeof data)[number], status: (typeof STATUSES)[number]) => {
    if (status === "cancelado") {
      setSelectedOrderId(null);
      setCancellationDraft({
        orderId: order.id,
        orderNumber: order.order_number,
        reason: order.cancellation_reason ?? "",
      });
      return;
    }

    mut.mutate({
      order_id: order.id,
      status,
      cancellation_reason: null,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">Pedidos</h1>
          <p className="text-sm text-muted-foreground">Últimos 100 pedidos</p>
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded-md border bg-background px-3 py-2 text-sm"
        >
          <option value="todos">Todos</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-3 md:hidden">
        {filtered.map((order) => (
          <button
            key={order.id}
            type="button"
            onClick={() => setSelectedOrderId(order.id)}
            aria-label={`Ver detalhes do pedido ${order.order_number}`}
            className="flex w-full items-center gap-3 rounded-xl border bg-card p-4 text-left shadow-sm transition active:scale-[0.99]"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-xs font-semibold text-muted-foreground">
                  {order.order_number}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatDate(order.created_at)}
                </span>
              </div>
              <div className="mt-2 flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{order.customer_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {order.order_type === "entrega" ? "Entrega" : "Take-away"}
                  </p>
                </div>
                <p className="shrink-0 font-semibold">{formatMoney(order.total_cents)}</p>
              </div>
              <span
                className={`mt-3 inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                  STATUS_STYLES[order.status]
                }`}
              >
                {STATUS_LABEL[order.status]}
              </span>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>
        ))}
        {filtered.length === 0 ? (
          <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
            Sem pedidos
          </div>
        ) : null}
      </div>

      <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Nº</th>
              <th className="px-4 py-2">Cliente</th>
              <th className="px-4 py-2">Tipo</th>
              <th className="px-4 py-2">Total</th>
              <th className="px-4 py-2">Data</th>
              <th className="px-4 py-2">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((o) => (
              <tr key={o.id} className="hover:bg-muted/30">
                <td className="px-4 py-2 font-mono text-xs">{o.order_number}</td>
                <td className="px-4 py-2">
                  <div className="font-medium">{o.customer_name}</div>
                  <div className="text-xs text-muted-foreground">{o.customer_phone}</div>
                  {o.address && <div className="text-xs text-muted-foreground">{o.address}</div>}
                </td>
                <td className="px-4 py-2 text-xs">
                  {o.order_type === "entrega" ? "Entrega" : "Take-away"}
                </td>
                <td className="px-4 py-2 font-semibold">{formatMoney(o.total_cents)}</td>
                <td className="px-4 py-2 text-xs text-muted-foreground">
                  {formatDate(o.created_at)}
                </td>
                <td className="px-4 py-2">
                  <select
                    value={o.status}
                    disabled={mut.isPending}
                    onChange={(e) =>
                      requestStatusChange(o, e.target.value as (typeof STATUSES)[number])
                    }
                    className="rounded-md border bg-background px-2 py-1 text-xs"
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>
                  {o.status === "cancelado" && o.cancellation_reason ? (
                    <div className="mt-2 max-w-52 text-xs text-red-700">
                      <p>{o.cancellation_reason}</p>
                      <button
                        type="button"
                        className="mt-1 font-medium underline underline-offset-2"
                        onClick={() => requestStatusChange(o, "cancelado")}
                      >
                        Alterar motivo
                      </button>
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-muted-foreground">
                  Sem pedidos
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog
        open={Boolean(selectedOrder)}
        onOpenChange={(open) => {
          if (!open) setSelectedOrderId(null);
        }}
      >
        {selectedOrder ? (
          <DialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] overflow-y-auto rounded-2xl p-0 sm:max-w-lg">
            <DialogHeader className="border-b px-5 pb-4 pt-5 text-left">
              <DialogTitle className="font-display text-xl">
                Pedido {selectedOrder.order_number}
              </DialogTitle>
              <DialogDescription>
                {formatDate(selectedOrder.created_at)} ·{" "}
                {selectedOrder.order_type === "entrega" ? "Entrega" : "Take-away"}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5 px-5 pb-6">
              <section>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Cliente
                </p>
                <p className="mt-1 font-semibold">{selectedOrder.customer_name}</p>
                <a
                  href={`tel:${selectedOrder.customer_phone}`}
                  className="mt-2 inline-flex items-center gap-2 text-sm text-brand"
                >
                  <Phone className="h-4 w-4" aria-hidden="true" />
                  {selectedOrder.customer_phone}
                </a>
                {selectedOrder.address ? (
                  <p className="mt-2 flex items-start gap-2 text-sm text-muted-foreground">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{selectedOrder.address}</span>
                  </p>
                ) : null}
              </section>

              <section className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-muted/60 p-3">
                  <p className="text-xs text-muted-foreground">Tipo</p>
                  <p className="mt-1 text-sm font-semibold">
                    {selectedOrder.order_type === "entrega" ? "Entrega" : "Take-away"}
                  </p>
                </div>
                <div className="rounded-xl bg-muted/60 p-3">
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className="mt-1 text-sm font-semibold">
                    {formatMoney(selectedOrder.total_cents)}
                  </p>
                </div>
              </section>

              {selectedOrder.notes ? (
                <section>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Observações
                  </p>
                  <p className="mt-1 rounded-xl border p-3 text-sm">{selectedOrder.notes}</p>
                </section>
              ) : null}

              {selectedOrder.status === "cancelado" && selectedOrder.cancellation_reason ? (
                <section className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-900">
                  <p className="text-xs font-medium uppercase tracking-wide">
                    Motivo do cancelamento
                  </p>
                  <p className="mt-1 text-sm">{selectedOrder.cancellation_reason}</p>
                  <button
                    type="button"
                    className="mt-2 text-sm font-medium underline underline-offset-2"
                    onClick={() => requestStatusChange(selectedOrder, "cancelado")}
                  >
                    Alterar motivo
                  </button>
                </section>
              ) : null}

              <label className="block text-sm font-medium">
                Estado do pedido
                <select
                  value={selectedOrder.status}
                  disabled={mut.isPending}
                  onChange={(event) =>
                    requestStatusChange(
                      selectedOrder,
                      event.target.value as (typeof STATUSES)[number],
                    )
                  }
                  className="mt-2 w-full rounded-xl border bg-background px-3 py-3 text-sm"
                >
                  {STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {STATUS_LABEL[status]}
                    </option>
                  ))}
                </select>
              </label>

              <div
                className={`rounded-xl px-4 py-3 text-sm font-medium ${
                  STATUS_STYLES[selectedOrder.status]
                }`}
              >
                Estado atual: {STATUS_LABEL[selectedOrder.status]}
              </div>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>

      <Dialog
        open={Boolean(cancellationDraft)}
        onOpenChange={(open) => {
          if (!open && !mut.isPending) setCancellationDraft(null);
        }}
      >
        {cancellationDraft ? (
          <DialogContent className="w-[calc(100%-2rem)] rounded-2xl sm:max-w-md">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const reason = cancellationDraft.reason.trim();
                if (reason.length < 3) return;
                mut.mutate({
                  order_id: cancellationDraft.orderId,
                  status: "cancelado",
                  cancellation_reason: reason,
                });
              }}
            >
              <DialogHeader className="text-left">
                <DialogTitle>Cancelar {cancellationDraft.orderNumber}</DialogTitle>
                <DialogDescription>
                  O cliente verá este motivo no acompanhamento e no histórico do pedido.
                </DialogDescription>
              </DialogHeader>

              <label htmlFor="cancellation-reason" className="mt-5 block text-sm font-medium">
                Motivo do cancelamento
              </label>
              <textarea
                id="cancellation-reason"
                required
                autoFocus
                minLength={3}
                maxLength={500}
                value={cancellationDraft.reason}
                onChange={(event) =>
                  setCancellationDraft((draft) =>
                    draft ? { ...draft, reason: event.target.value } : draft,
                  )
                }
                placeholder="Ex.: produto indisponível"
                className="mt-2 min-h-28 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
              />
              <p className="mt-1 text-right text-xs text-muted-foreground">
                {cancellationDraft.reason.length}/500
              </p>

              <DialogFooter className="mt-5 gap-2 sm:space-x-0">
                <button
                  type="button"
                  disabled={mut.isPending}
                  onClick={() => setCancellationDraft(null)}
                  className="rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50"
                >
                  Voltar
                </button>
                <button
                  type="submit"
                  disabled={mut.isPending || cancellationDraft.reason.trim().length < 3}
                  className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {mut.isPending ? "A cancelar..." : "Confirmar cancelamento"}
                </button>
              </DialogFooter>
            </form>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}

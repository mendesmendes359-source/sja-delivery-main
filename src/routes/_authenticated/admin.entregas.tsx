import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney, formatDate } from "@/lib/format";
import { useState } from "react";
import { toast } from "sonner";
import type { RouteLoaderArgs } from "@/router-context";

const deliveryQO = queryOptions({
  queryKey: ["admin", "deliveries"],
  queryFn: async () => {
    const { data: orders, error } = await supabase
      .from("orders")
      .select(
        "id, order_number, customer_name, customer_phone, address, status, total_cents, created_at",
      )
      .eq("order_type", "entrega")
      .in("status", ["aceite", "em_preparacao", "saiu_entrega", "entregue"])
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    const { data: dels } = await supabase
      .from("deliveries")
      .select("id, order_id, courier_name, status, dispatched_at, delivered_at");
    return { orders: orders ?? [], deliveries: dels ?? [] };
  },
  refetchInterval: 15000,
});

export const Route = createFileRoute("/_authenticated/admin/entregas")({
  loader: ({ context }: RouteLoaderArgs) => context.queryClient.ensureQueryData(deliveryQO),
  component: DeliveriesAdmin,
});

function DeliveriesAdmin() {
  const { data } = useSuspenseQuery(deliveryQO);
  const qc = useQueryClient();
  const [couriers, setCouriers] = useState<Record<string, string>>({});

  const assignMut = useMutation({
    mutationFn: async (v: { order_id: string; courier_name: string }) => {
      const existing = data.deliveries.find((d) => d.order_id === v.order_id);
      if (existing) {
        const { error } = await supabase
          .from("deliveries")
          .update({ courier_name: v.courier_name })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("deliveries")
          .insert({ order_id: v.order_id, courier_name: v.courier_name, status: "atribuido" });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "deliveries"] });
      toast.success("Estafeta atribuído");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const markMut = useMutation({
    mutationFn: async (v: { order_id: string; kind: "dispatch" | "delivered" }) => {
      const now = new Date().toISOString();
      if (v.kind === "dispatch") {
        await supabase
          .from("deliveries")
          .upsert(
            { order_id: v.order_id, status: "em_transito", dispatched_at: now },
            { onConflict: "order_id" },
          );
        await supabase.from("orders").update({ status: "saiu_entrega" }).eq("id", v.order_id);
      } else {
        await supabase
          .from("deliveries")
          .upsert(
            { order_id: v.order_id, status: "entregue", delivered_at: now },
            { onConflict: "order_id" },
          );
        await supabase.from("orders").update({ status: "entregue" }).eq("id", v.order_id);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "deliveries"] });
      qc.invalidateQueries({ queryKey: ["admin", "orders"] });
      toast.success("Atualizado");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Entregas</h1>
        <p className="text-sm text-muted-foreground">Gerir entregas ao domicílio</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {data.orders.map((o) => {
          const d = data.deliveries.find((x) => x.order_id === o.id);
          return (
            <div key={o.id} className="rounded-xl border bg-card p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-mono text-xs text-muted-foreground">{o.order_number}</div>
                  <div className="font-semibold">{o.customer_name}</div>
                  <div className="text-sm text-muted-foreground">{o.customer_phone}</div>
                  <div className="mt-1 text-sm">{o.address}</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">{formatMoney(o.total_cents)}</div>
                  <div className="text-xs text-muted-foreground">{formatDate(o.created_at)}</div>
                  <div className="mt-1 inline-block rounded-full bg-accent px-2 py-0.5 text-xs text-brand font-semibold">
                    {o.status}
                  </div>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <input
                  placeholder="Nome do estafeta"
                  defaultValue={d?.courier_name ?? ""}
                  onChange={(e) => setCouriers((c) => ({ ...c, [o.id]: e.target.value }))}
                  className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm"
                />
                <button
                  onClick={() =>
                    assignMut.mutate({
                      order_id: o.id,
                      courier_name: couriers[o.id] ?? d?.courier_name ?? "",
                    })
                  }
                  className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
                >
                  Atribuir
                </button>
                {o.status !== "saiu_entrega" && o.status !== "entregue" && (
                  <button
                    onClick={() => markMut.mutate({ order_id: o.id, kind: "dispatch" })}
                    className="rounded-md bg-navy px-3 py-1.5 text-sm text-navy-foreground"
                  >
                    Saiu p/ entrega
                  </button>
                )}
                {o.status !== "entregue" && (
                  <button
                    onClick={() => markMut.mutate({ order_id: o.id, kind: "delivered" })}
                    className="rounded-md bg-brand px-3 py-1.5 text-sm text-brand-foreground"
                  >
                    Entregue
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {data.orders.length === 0 && <p className="text-muted-foreground">Sem entregas ativas.</p>}
      </div>
    </div>
  );
}

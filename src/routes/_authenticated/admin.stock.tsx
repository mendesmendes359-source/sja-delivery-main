import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

const stockQO = queryOptions({
  queryKey: ["admin", "stock"],
  queryFn: async () => {
    const { data, error } = await supabase.from("stock_items").select("*").order("name");
    if (error) throw error;
    return data ?? [];
  },
});

export const Route = createFileRoute("/_authenticated/admin/stock")({
  loader: ({ context }) => context.queryClient.ensureQueryData(stockQO),
  component: StockAdmin,
});

function StockAdmin() {
  const { data } = useSuspenseQuery(stockQO);
  const qc = useQueryClient();
  const [editing, setEditing] = useState<any | null>(null);

  const save = useMutation({
    mutationFn: async (v: any) => {
      const payload = {
        name: v.name,
        unit: v.unit,
        quantity: Number(v.quantity),
        min_quantity: Number(v.min_quantity),
        unit_cost_cents: Math.round(Number(v.unit_cost_eur ?? 0) * 100),
      };
      if (v.id) {
        const { error } = await supabase.from("stock_items").update(payload).eq("id", v.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("stock_items").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin", "stock"] }); setEditing(null); toast.success("Guardado"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });
  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("stock_items").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin", "stock"] }); toast.success("Removido"); },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold">Stock</h1>
          <p className="text-sm text-muted-foreground">Gestão de armazenamento</p>
        </div>
        <button
          onClick={() => setEditing({ name: "", unit: "un", quantity: 0, min_quantity: 0, unit_cost_eur: 0 })}
          className="inline-flex items-center gap-1 rounded-md bg-brand px-3 py-2 text-sm font-semibold text-brand-foreground"
        >
          <Plus className="h-4 w-4" /> Novo
        </button>
      </div>
      <div className="overflow-hidden rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Nome</th>
              <th className="px-4 py-2">Unidade</th>
              <th className="px-4 py-2">Quantidade</th>
              <th className="px-4 py-2">Mínimo</th>
              <th className="px-4 py-2">Custo</th>
              <th className="px-4 py-2 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {data.map((s) => {
              const low = Number(s.quantity) <= Number(s.min_quantity);
              return (
                <tr key={s.id} className={low ? "bg-accent/30" : ""}>
                  <td className="px-4 py-2 font-medium">{s.name}</td>
                  <td className="px-4 py-2 text-xs">{s.unit}</td>
                  <td className={`px-4 py-2 font-semibold ${low ? "text-brand" : ""}`}>{s.quantity}</td>
                  <td className="px-4 py-2">{s.min_quantity}</td>
                  <td className="px-4 py-2">{(s.unit_cost_cents / 100).toFixed(2)}€</td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => setEditing({ ...s, unit_cost_eur: (s.unit_cost_cents / 100).toFixed(2) })} className="rounded border px-2 py-1 text-xs hover:bg-muted">Ajustar</button>
                    <button onClick={() => confirm("Remover?") && del.mutate(s.id)} className="ml-1 rounded p-1.5 text-brand hover:bg-accent">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {editing && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={() => setEditing(null)}>
          <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-display text-xl font-bold">{editing.id ? "Ajustar stock" : "Novo item"}</h2>
            <div className="mt-4 grid gap-3">
              <label className="text-sm">Nome<input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="mt-1 w-full rounded border bg-background px-3 py-2 text-sm" /></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">Unidade<input value={editing.unit} onChange={(e) => setEditing({ ...editing, unit: e.target.value })} className="mt-1 w-full rounded border bg-background px-3 py-2 text-sm" /></label>
                <label className="text-sm">Custo (€)<input type="number" step="0.01" value={editing.unit_cost_eur} onChange={(e) => setEditing({ ...editing, unit_cost_eur: e.target.value })} className="mt-1 w-full rounded border bg-background px-3 py-2 text-sm" /></label>
                <label className="text-sm">Quantidade<input type="number" value={editing.quantity} onChange={(e) => setEditing({ ...editing, quantity: e.target.value })} className="mt-1 w-full rounded border bg-background px-3 py-2 text-sm" /></label>
                <label className="text-sm">Mínimo<input type="number" value={editing.min_quantity} onChange={(e) => setEditing({ ...editing, min_quantity: e.target.value })} className="mt-1 w-full rounded border bg-background px-3 py-2 text-sm" /></label>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="rounded-md border px-4 py-2 text-sm">Cancelar</button>
              <button onClick={() => save.mutate(editing)} className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground">Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

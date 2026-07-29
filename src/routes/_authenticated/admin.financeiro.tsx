import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getFinancials } from "@/lib/financials.functions";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney } from "@/lib/format";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/financeiro")({
  component: FinancePage,
});

function FinancePage() {
  const qc = useQueryClient();
  const today = new Date();
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  const [from, setFrom] = useState(first.toISOString().slice(0, 10));
  const [to, setTo] = useState(today.toISOString().slice(0, 10));

  const getFinFn = useServerFn(getFinancials);
  const fin = useQuery({
    queryKey: ["fin", from, to],
    queryFn: () => getFinFn({ data: { from: `${from}T00:00:00.000Z`, to: `${to}T23:59:59.999Z` } }),
  });

  const expenses = useQuery({
    queryKey: ["expenses", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .gte("expense_date", from)
        .lte("expense_date", to)
        .order("expense_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const [newExp, setNewExp] = useState({
    category: "",
    description: "",
    amount_kz: "",
    expense_date: today.toISOString().slice(0, 10),
  });
  const addExp = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("expenses").insert({
        category: newExp.category,
        description: newExp.description || null,
        amount_cents: Math.round(Number(newExp.amount_kz) * 100),
        expense_date: newExp.expense_date,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["fin"] });
      setNewExp({
        category: "",
        description: "",
        amount_kz: "",
        expense_date: today.toISOString().slice(0, 10),
      });
      toast.success("Despesa adicionada");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });
  const delExp = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["fin"] });
    },
  });

  const f = fin.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">Financeiro</h1>
          <p className="text-sm text-muted-foreground">Balanço de receitas e despesas</p>
        </div>
        <div className="flex items-end gap-2">
          <label className="text-xs">
            De
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1 block rounded border bg-background px-2 py-1 text-sm"
            />
          </label>
          <label className="text-xs">
            Até
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1 block rounded border bg-background px-2 py-1 text-sm"
            />
          </label>
        </div>
      </div>

      {f && (
        <div className="grid gap-4 md:grid-cols-4">
          <Stat label="Receita entregue" value={formatMoney(f.revenue_cents)} tone="brand" />
          <Stat label="Volume bruto" value={formatMoney(f.gross_cents)} />
          <Stat label="Despesas" value={formatMoney(f.expenses_cents)} tone="destructive" />
          <Stat
            label="Lucro"
            value={formatMoney(f.profit_cents)}
            tone={f.profit_cents >= 0 ? "brand" : "destructive"}
          />
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-[1fr_360px]">
        <div className="rounded-xl border bg-card p-5">
          <h2 className="font-semibold">Despesas</h2>
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="py-2">Data</th>
                <th>Categoria</th>
                <th>Descrição</th>
                <th className="text-right">Valor</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {(expenses.data ?? []).map((e) => (
                <tr key={e.id}>
                  <td className="py-2 text-xs">{e.expense_date}</td>
                  <td>{e.category}</td>
                  <td className="text-muted-foreground">{e.description}</td>
                  <td className="text-right font-semibold">{formatMoney(e.amount_cents)}</td>
                  <td className="text-right">
                    <button onClick={() => delExp.mutate(e.id)} className="p-1 text-brand">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {(expenses.data ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-muted-foreground">
                    Sem despesas no período
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="rounded-xl border bg-card p-5 h-fit">
          <h2 className="font-semibold">Nova despesa</h2>
          <div className="mt-3 space-y-3">
            <input
              placeholder="Categoria"
              value={newExp.category}
              onChange={(e) => setNewExp({ ...newExp, category: e.target.value })}
              className="w-full rounded border bg-background px-3 py-2 text-sm"
            />
            <input
              placeholder="Descrição"
              value={newExp.description}
              onChange={(e) => setNewExp({ ...newExp, description: e.target.value })}
              className="w-full rounded border bg-background px-3 py-2 text-sm"
            />
            <input
              type="number"
              step="1"
              min="0"
              placeholder="Valor (Kz)"
              value={newExp.amount_kz}
              onChange={(e) => setNewExp({ ...newExp, amount_kz: e.target.value })}
              className="w-full rounded border bg-background px-3 py-2 text-sm"
            />
            <input
              type="date"
              value={newExp.expense_date}
              onChange={(e) => setNewExp({ ...newExp, expense_date: e.target.value })}
              className="w-full rounded border bg-background px-3 py-2 text-sm"
            />
            <button
              onClick={() => addExp.mutate()}
              disabled={!newExp.category || !newExp.amount_kz}
              className="inline-flex w-full items-center justify-center gap-1 rounded-md bg-brand px-3 py-2 text-sm font-semibold text-brand-foreground disabled:opacity-50"
            >
              <Plus className="h-4 w-4" /> Adicionar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "brand" | "destructive";
}) {
  const color =
    tone === "brand" ? "text-brand" : tone === "destructive" ? "text-brand" : "text-navy";
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-2 font-display text-2xl font-bold ${color}`}>{value}</div>
    </div>
  );
}

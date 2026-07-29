import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { AlertTriangle, Boxes, ChevronRight, PackageCheck, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney } from "@/lib/format";

const stockQO = queryOptions({
  queryKey: ["admin", "stock"],
  queryFn: async () => {
    const { data, error } = await supabase.from("stock_items").select("*").order("name");
    if (error) throw error;
    return data ?? [];
  },
});

type StockItem = Awaited<ReturnType<typeof stockQO.queryFn>>[number];

type StockForm = {
  id?: string;
  name: string;
  unit: string;
  quantity: string | number;
  min_quantity: string | number;
  unit_cost_kz: string | number;
};

const emptyStockForm: StockForm = {
  name: "",
  unit: "un",
  quantity: 0,
  min_quantity: 0,
  unit_cost_kz: 0,
};

export const Route = createFileRoute("/_authenticated/admin/stock")({
  loader: ({ context }) => context.queryClient.ensureQueryData(stockQO),
  component: StockAdmin,
});

function StockAdmin() {
  const { data } = useSuspenseQuery(stockQO);
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<StockForm | null>(null);
  const [selectedStockId, setSelectedStockId] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async (value: StockForm) => {
      const payload = {
        name: value.name.trim(),
        unit: value.unit.trim(),
        quantity: Number(value.quantity),
        min_quantity: Number(value.min_quantity),
        unit_cost_cents: Math.round(Number(value.unit_cost_kz || 0) * 100),
      };

      if (value.id) {
        const { error } = await supabase.from("stock_items").update(payload).eq("id", value.id);
        if (error) throw error;
        return;
      }

      const { error } = await supabase.from("stock_items").insert(payload);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "stock"] });
      setEditing(null);
      toast.success("Stock guardado");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Erro"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("stock_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "stock"] });
      setSelectedStockId(null);
      toast.success("Item removido");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Erro"),
  });

  const selectedStock = data.find((item) => item.id === selectedStockId) ?? null;
  const lowStockCount = data.filter(isLowStock).length;
  const estimatedValue = data.reduce(
    (total, item) => total + Math.round(Number(item.quantity) * item.unit_cost_cents),
    0,
  );

  function openEditor(item?: StockItem) {
    setEditing(
      item
        ? {
            id: item.id,
            name: item.name,
            unit: item.unit,
            quantity: item.quantity,
            min_quantity: item.min_quantity,
            unit_cost_kz: Math.round(item.unit_cost_cents / 100),
          }
        : emptyStockForm,
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">Stock</h1>
          <p className="text-sm text-muted-foreground">Gestão de armazenamento</p>
        </div>
        <button
          type="button"
          onClick={() => openEditor()}
          className="inline-flex items-center gap-1 rounded-md bg-brand px-3 py-2 text-sm font-semibold text-brand-foreground"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Novo
        </button>
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <MetricCard
          icon={<Boxes className="h-4 w-4" />}
          label="Itens"
          value={String(data.length)}
        />
        <MetricCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Stock baixo"
          value={String(lowStockCount)}
          alert={lowStockCount > 0}
        />
        <MetricCard
          icon={<PackageCheck className="h-4 w-4" />}
          label="Valor estimado"
          value={formatMoney(estimatedValue)}
          className="col-span-2 md:col-span-1"
        />
      </section>

      <div className="space-y-3 md:hidden">
        {data.map((item) => {
          const low = isLowStock(item);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelectedStockId(item.id)}
              aria-label={`Ver detalhes do stock ${item.name}`}
              className="flex w-full items-center gap-3 rounded-xl border bg-card p-4 text-left shadow-sm transition active:scale-[0.99]"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{item.name}</p>
                    <p className="text-xs text-muted-foreground">Unidade: {item.unit}</p>
                  </div>
                  <StockBadge low={low} />
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <CompactMetric label="Quantidade" value={formatQuantity(item.quantity)} />
                  <CompactMetric label="Mínimo" value={formatQuantity(item.min_quantity)} />
                  <CompactMetric label="Custo" value={formatMoney(item.unit_cost_cents)} />
                </div>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            </button>
          );
        })}
        {data.length === 0 ? (
          <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
            Sem itens de stock
          </div>
        ) : null}
      </div>

      <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Unidade</th>
              <th className="px-4 py-3">Quantidade</th>
              <th className="px-4 py-3">Mínimo</th>
              <th className="px-4 py-3">Custo</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {data.map((item) => {
              const low = isLowStock(item);
              return (
                <tr key={item.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{item.name}</td>
                  <td className="px-4 py-3 text-xs">{item.unit}</td>
                  <td className={`px-4 py-3 font-semibold ${low ? "text-brand" : ""}`}>
                    {formatQuantity(item.quantity)}
                  </td>
                  <td className="px-4 py-3">{formatQuantity(item.min_quantity)}</td>
                  <td className="px-4 py-3">{formatMoney(item.unit_cost_cents)}</td>
                  <td className="px-4 py-3">
                    <StockBadge low={low} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => openEditor(item)}
                      className="rounded border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                    >
                      Ajustar
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedStockId(item.id)}
                      className="ml-2 rounded border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                    >
                      Detalhes
                    </button>
                  </td>
                </tr>
              );
            })}
            {data.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-muted-foreground">
                  Sem itens de stock
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <Dialog
        open={Boolean(selectedStock)}
        onOpenChange={(open) => {
          if (!open) setSelectedStockId(null);
        }}
      >
        {selectedStock ? (
          <DialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] overflow-y-auto rounded-2xl p-0 sm:max-w-lg">
            <DialogHeader className="border-b px-5 pb-4 pt-5 text-left">
              <div className="flex items-center gap-3 pr-8">
                <DialogTitle className="min-w-0 flex-1 truncate font-display text-xl">
                  {selectedStock.name}
                </DialogTitle>
                <StockBadge low={isLowStock(selectedStock)} />
              </div>
              <DialogDescription>Detalhes e controlo do item de stock</DialogDescription>
            </DialogHeader>

            <div className="space-y-5 px-5 pb-6">
              <section className="grid grid-cols-3 gap-3">
                <DetailMetric
                  label="Quantidade"
                  value={`${formatQuantity(selectedStock.quantity)} ${selectedStock.unit}`}
                />
                <DetailMetric
                  label="Mínimo"
                  value={`${formatQuantity(selectedStock.min_quantity)} ${selectedStock.unit}`}
                />
                <DetailMetric label="Custo" value={formatMoney(selectedStock.unit_cost_cents)} />
              </section>

              <section className="rounded-xl bg-muted/60 p-4">
                <p className="text-xs text-muted-foreground">Valor estimado em stock</p>
                <p className="mt-1 font-display text-xl font-bold">
                  {formatMoney(
                    Math.round(Number(selectedStock.quantity) * selectedStock.unit_cost_cents),
                  )}
                </p>
              </section>

              <div
                className={`rounded-xl px-4 py-3 text-sm font-medium ${
                  isLowStock(selectedStock)
                    ? "bg-red-100 text-red-800"
                    : "bg-emerald-100 text-emerald-800"
                }`}
              >
                {isLowStock(selectedStock)
                  ? "A quantidade atingiu ou ficou abaixo do mínimo definido."
                  : "A quantidade disponível está acima do mínimo definido."}
              </div>

              <div className="grid grid-cols-[1fr_auto] gap-3">
                <button
                  type="button"
                  onClick={() => {
                    openEditor(selectedStock);
                    setSelectedStockId(null);
                  }}
                  className="rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-brand-foreground"
                >
                  Ajustar stock
                </button>
                <button
                  type="button"
                  disabled={remove.isPending}
                  onClick={() => {
                    if (confirm(`Remover ${selectedStock.name}?`)) {
                      remove.mutate(selectedStock.id);
                    }
                  }}
                  aria-label={`Remover ${selectedStock.name}`}
                  className="grid w-12 place-items-center rounded-xl border text-brand hover:bg-accent disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>

      <Dialog
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        {editing ? (
          <DialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] overflow-y-auto rounded-2xl sm:max-w-md">
            <DialogHeader className="text-left">
              <DialogTitle className="font-display text-xl">
                {editing.id ? "Ajustar stock" : "Novo item"}
              </DialogTitle>
              <DialogDescription>
                {editing.id
                  ? "Atualize a quantidade, o mínimo ou o custo do item."
                  : "Registe um novo item no stock."}
              </DialogDescription>
            </DialogHeader>

            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                save.mutate(editing);
              }}
            >
              <StockField label="Nome">
                <input
                  required
                  value={editing.name}
                  onChange={(event) => setEditing({ ...editing, name: event.target.value })}
                  className="mt-1 w-full rounded-xl border bg-background px-3 py-3 text-sm"
                />
              </StockField>

              <div className="grid grid-cols-2 gap-3">
                <StockField label="Unidade">
                  <input
                    required
                    value={editing.unit}
                    onChange={(event) => setEditing({ ...editing, unit: event.target.value })}
                    className="mt-1 w-full rounded-xl border bg-background px-3 py-3 text-sm"
                  />
                </StockField>
                <StockField label="Custo (Kz)">
                  <input
                    required
                    type="number"
                    step="1"
                    min="0"
                    value={editing.unit_cost_kz}
                    onChange={(event) =>
                      setEditing({ ...editing, unit_cost_kz: event.target.value })
                    }
                    className="mt-1 w-full rounded-xl border bg-background px-3 py-3 text-sm"
                  />
                </StockField>
                <StockField label="Quantidade">
                  <input
                    required
                    type="number"
                    step="0.01"
                    min="0"
                    value={editing.quantity}
                    onChange={(event) => setEditing({ ...editing, quantity: event.target.value })}
                    className="mt-1 w-full rounded-xl border bg-background px-3 py-3 text-sm"
                  />
                </StockField>
                <StockField label="Mínimo">
                  <input
                    required
                    type="number"
                    step="0.01"
                    min="0"
                    value={editing.min_quantity}
                    onChange={(event) =>
                      setEditing({ ...editing, min_quantity: event.target.value })
                    }
                    className="mt-1 w-full rounded-xl border bg-background px-3 py-3 text-sm"
                  />
                </StockField>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="rounded-xl border px-4 py-3 text-sm font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={save.isPending}
                  className="rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-brand-foreground disabled:opacity-50"
                >
                  {save.isPending ? "A guardar..." : "Guardar"}
                </button>
              </div>
            </form>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  alert = false,
  className = "",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  alert?: boolean;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border bg-card p-4 sm:p-5 ${className}`}>
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-xs uppercase tracking-wider">{label}</span>
        <span
          className={`grid h-8 w-8 place-items-center rounded-lg ${
            alert ? "bg-red-100 text-red-700" : "bg-accent text-brand"
          }`}
        >
          {icon}
        </span>
      </div>
      <div className={`mt-2 font-display text-2xl font-bold ${alert ? "text-brand" : ""}`}>
        {value}
      </div>
    </div>
  );
}

function CompactMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-muted/60 px-2 py-2">
      <p className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-xs font-semibold">{value}</p>
    </div>
  );
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-muted/60 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold">{value}</p>
    </div>
  );
}

function StockBadge({ low }: { low: boolean }) {
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
        low ? "bg-red-100 text-red-800" : "bg-emerald-100 text-emerald-800"
      }`}
    >
      {low ? "Stock baixo" : "Disponível"}
    </span>
  );
}

function StockField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-medium">
      {label}
      {children}
    </label>
  );
}

function isLowStock(item: Pick<StockItem, "quantity" | "min_quantity">) {
  return Number(item.quantity) <= Number(item.min_quantity);
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("pt-AO", {
    maximumFractionDigits: 2,
  }).format(Number(value));
}

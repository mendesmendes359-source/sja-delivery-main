import { createFileRoute, redirect } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { MapPin, Pencil, Plus, Power, Settings2 } from "lucide-react";
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
import type { RouteLoaderArgs } from "@/router-context";

const deliveryZonesQO = queryOptions({
  queryKey: ["admin", "delivery-zones"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("delivery_zones")
      .select("id, name, fee_cents, active, sort_order, created_at, updated_at")
      .order("sort_order")
      .order("name");
    if (error) throw error;
    return data ?? [];
  },
});

type ZoneEditor = {
  id: string | null;
  name: string;
  feeKz: string;
  active: boolean;
  sortOrder: string;
};

const EMPTY_EDITOR: ZoneEditor = {
  id: null,
  name: "",
  feeKz: "",
  active: true,
  sortOrder: "0",
};

export const Route = createFileRoute("/_authenticated/admin/configuracoes")({
  beforeLoad: ({ context }: { context: { role?: "admin" | "staff" } }) => {
    if (context.role !== "admin") throw redirect({ to: "/admin" });
  },
  loader: ({ context }: RouteLoaderArgs) => context.queryClient.ensureQueryData(deliveryZonesQO),
  component: SettingsAdmin,
});

function SettingsAdmin() {
  const { data: zones } = useSuspenseQuery(deliveryZonesQO);
  const queryClient = useQueryClient();
  const [editor, setEditor] = useState<ZoneEditor | null>(null);

  const refreshZones = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin", "delivery-zones"] }),
      queryClient.invalidateQueries({ queryKey: ["delivery-zones", "active"] }),
    ]);

  const saveMutation = useMutation({
    mutationFn: async (draft: ZoneEditor) => {
      const name = draft.name.trim();
      const feeKz = Number(draft.feeKz);
      const sortOrder = Number(draft.sortOrder);

      if (name.length < 2 || name.length > 100) {
        throw new Error("Indique uma localização entre 2 e 100 caracteres");
      }
      if (!Number.isFinite(feeKz) || feeKz < 0 || feeKz > 1000000) {
        throw new Error("Indique uma taxa entre 0 e 1 000 000 Kz");
      }
      if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 10000) {
        throw new Error("A ordem deve ser um número inteiro entre 0 e 10 000");
      }

      const values = {
        name,
        fee_cents: Math.round(feeKz * 100),
        active: draft.active,
        sort_order: sortOrder,
      };
      const result = draft.id
        ? await supabase.from("delivery_zones").update(values).eq("id", draft.id)
        : await supabase.from("delivery_zones").insert(values);

      if (result.error) throw result.error;
    },
    onSuccess: async (_, draft) => {
      await refreshZones();
      setEditor(null);
      toast.success(draft.id ? "Localização atualizada" : "Localização adicionada");
    },
    onError: showError,
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("delivery_zones").update({ active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: async (_, variables) => {
      await refreshZones();
      toast.success(variables.active ? "Localização ativada" : "Localização desativada");
    },
    onError: showError,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">Configurações</h1>
          <p className="text-sm text-muted-foreground">
            Localizações disponíveis e respetivas taxas de entrega
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditor(EMPTY_EDITOR)}
          className="inline-flex items-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Nova localização
        </button>
      </div>

      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
        <div className="flex items-start gap-3">
          <Settings2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <p>
            O cliente escolhe uma localização no checkout. A taxa ativa é somada aos produtos e
            gravada no pedido; alterações futuras não mudam o histórico.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {zones.map((zone) => (
          <article
            key={zone.id}
            className={`rounded-xl border bg-card p-5 shadow-sm ${zone.active ? "" : "opacity-70"}`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                  <h2 className="truncate font-semibold">{zone.name}</h2>
                </div>
                <span
                  className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                    zone.active
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {zone.active ? "Disponível no checkout" : "Desativada"}
                </span>
              </div>
              <div className="text-right">
                <div className="font-display text-xl font-bold text-navy">
                  {formatMoney(zone.fee_cents)}
                </div>
                <div className="text-xs text-muted-foreground">Ordem {zone.sort_order}</div>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2 border-t pt-4">
              <button
                type="button"
                onClick={() =>
                  setEditor({
                    id: zone.id,
                    name: zone.name,
                    feeKz: String(zone.fee_cents / 100),
                    active: zone.active,
                    sortOrder: String(zone.sort_order),
                  })
                }
                className="inline-flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted"
              >
                <Pencil className="h-4 w-4" aria-hidden="true" />
                Editar
              </button>
              <button
                type="button"
                disabled={statusMutation.isPending}
                onClick={() => statusMutation.mutate({ id: zone.id, active: !zone.active })}
                className="inline-flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
              >
                <Power className="h-4 w-4" aria-hidden="true" />
                {zone.active ? "Desativar" : "Ativar"}
              </button>
            </div>
          </article>
        ))}

        {zones.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground md:col-span-2 xl:col-span-3">
            Ainda não existem localizações. Adicione a primeira para disponibilizar entregas.
          </div>
        ) : null}
      </div>

      <Dialog open={Boolean(editor)} onOpenChange={(open) => !open && setEditor(null)}>
        <DialogContent className="w-[calc(100%-2rem)] rounded-2xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">
              {editor?.id ? "Editar localização" : "Nova localização"}
            </DialogTitle>
            <DialogDescription>
              Defina o nome apresentado ao cliente e a taxa aplicada a novos pedidos.
            </DialogDescription>
          </DialogHeader>

          {editor ? (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                saveMutation.mutate(editor);
              }}
            >
              <Field label="Nome da localização">
                <input
                  required
                  autoFocus
                  minLength={2}
                  maxLength={100}
                  value={editor.name}
                  onChange={(event) => setEditor({ ...editor, name: event.target.value })}
                  placeholder="Ex.: Samba"
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Taxa de entrega (Kz)">
                  <input
                    required
                    type="number"
                    min="0"
                    max="1000000"
                    step="1"
                    value={editor.feeKz}
                    onChange={(event) => setEditor({ ...editor, feeKz: event.target.value })}
                    className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                  />
                </Field>
                <Field label="Ordem de apresentação">
                  <input
                    required
                    type="number"
                    min="0"
                    max="10000"
                    step="1"
                    value={editor.sortOrder}
                    onChange={(event) => setEditor({ ...editor, sortOrder: event.target.value })}
                    className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                  />
                </Field>
              </div>

              <label className="flex items-center justify-between gap-4 rounded-xl border p-4">
                <div>
                  <span className="block text-sm font-medium">Disponível no checkout</span>
                  <span className="block text-xs text-muted-foreground">
                    Localizações desativadas deixam de aceitar novos pedidos.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={editor.active}
                  onChange={(event) => setEditor({ ...editor, active: event.target.checked })}
                  className="h-5 w-5 accent-[var(--color-brand)]"
                />
              </label>

              <div className="flex justify-end gap-2 border-t pt-4">
                <button
                  type="button"
                  onClick={() => setEditor(null)}
                  className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saveMutation.isPending}
                  className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground disabled:opacity-50"
                >
                  {saveMutation.isPending ? "A guardar..." : "Guardar localização"}
                </button>
              </div>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-medium">
      {label}
      {children}
    </label>
  );
}

function showError(error: unknown) {
  toast.error(error instanceof Error ? error.message : "Não foi possível guardar a configuração");
}

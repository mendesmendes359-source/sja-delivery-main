import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { ProductImage } from "@/components/product-image";
import { useCart } from "@/lib/cart";
import { formatMoney } from "@/lib/format";
import { saveOrderHistoryEntry } from "@/lib/order-history";
import { createOrder, listActiveDeliveryZones } from "@/lib/orders.functions";
import { AppSelect } from "@/components/ui/app-select";
import { MapPin, Minus, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/checkout")({
  head: () => ({
    meta: [
      { title: "Carrinho — SJA Fast Food" },
      { name: "description", content: "Finalize o seu pedido no SJA Fast Food." },
      { property: "og:title", content: "Checkout — SJA Fast Food" },
      { property: "og:description", content: "Finalize o seu pedido." },
    ],
  }),
  component: Checkout,
});

function Checkout() {
  const { items, setQty, remove, total_cents, clear } = useCart();
  const navigate = useNavigate();
  const createOrderFn = useServerFn(createOrder);
  const listDeliveryZonesFn = useServerFn(listActiveDeliveryZones);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [type, setType] = useState<"entrega" | "takeaway">("entrega");
  const [deliveryZoneId, setDeliveryZoneId] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const deliveryZonesQuery = useQuery({
    queryKey: ["delivery-zones", "active"],
    queryFn: () => listDeliveryZonesFn(),
    staleTime: 5 * 60 * 1000,
  });
  const deliveryZones = deliveryZonesQuery.data ?? [];
  const effectiveDeliveryZoneId = deliveryZoneId;
  const selectedDeliveryZone =
    deliveryZones.find((zone) => zone.id === effectiveDeliveryZoneId) ?? null;
  const deliveryFeeCents = type === "entrega" ? (selectedDeliveryZone?.fee_cents ?? 0) : 0;
  const orderTotalCents = total_cents + deliveryFeeCents;
  const deliveryZoneOptions = deliveryZones.map((zone) => ({
    value: zone.id,
    label: `${zone.name} — ${formatMoney(zone.fee_cents)}`,
  }));

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await createOrderFn({
        data: {
          customer_name: name.trim(),
          customer_phone: phone.trim(),
          order_type: type,
          delivery_zone_id: type === "entrega" ? effectiveDeliveryZoneId : null,
          address: type === "entrega" ? address.trim() : null,
          notes: notes.trim() || null,
          items: items.map((i) => ({ menu_item_id: i.id, quantity: i.quantity })),
        },
      });
      return res;
    },
    onSuccess: (res) => {
      saveOrderHistoryEntry({
        id: res.id,
        tracking_token: res.tracking_token,
        order_number: res.order_number,
        total_cents: res.total_cents,
        order_type: type,
        created_at: new Date().toISOString(),
      });
      clear();
      toast.success(`Pedido ${res.order_number} recebido!`);
      navigate({
        to: "/pedido/$id",
        params: { id: res.id },
        search: { token: res.tracking_token },
      });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Erro ao criar pedido");
    },
  });

  const canSubmit =
    items.length > 0 &&
    name.trim().length >= 2 &&
    phone.trim().length >= 6 &&
    (type === "takeaway" || (Boolean(selectedDeliveryZone) && address.trim().length >= 3)) &&
    !mutation.isPending;

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 md:grid-cols-[1fr_400px]">
        <div>
          <h1 className="font-display text-3xl md:text-4xl font-bold">Finalizar pedido</h1>
          <p className="mt-1 text-muted-foreground">
            Preencha os seus dados. Não é preciso criar conta.
          </p>

          {items.length === 0 ? (
            <div className="mt-8 rounded-xl border bg-card p-8 text-center">
              <p className="text-muted-foreground">O seu carrinho está vazio.</p>
              <Link
                to="/menu"
                className="mt-4 inline-block rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground"
              >
                Ver menu
              </Link>
            </div>
          ) : (
            <form
              className="mt-6 space-y-6"
              onSubmit={(e) => {
                e.preventDefault();
                if (canSubmit) mutation.mutate();
              }}
            >
              <div className="rounded-xl border bg-card p-5">
                <h2 className="font-semibold">Dados de contacto</h2>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <Field label="Nome">
                    <input
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="input"
                      maxLength={100}
                    />
                  </Field>
                  <Field label="Telefone">
                    <input
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="input"
                      placeholder="+244 9XX XXX XXX"
                      maxLength={20}
                    />
                  </Field>
                </div>
              </div>

              <div className="rounded-xl border bg-card p-5">
                <h2 className="font-semibold">Como quer receber?</h2>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  <label
                    className={`cursor-pointer rounded-lg border p-4 text-sm ${type === "entrega" ? "border-brand bg-accent" : ""}`}
                  >
                    <input
                      type="radio"
                      name="type"
                      checked={type === "entrega"}
                      onChange={() => setType("entrega")}
                      className="mr-2"
                    />
                    <strong>Entrega</strong> ao domicílio
                    <span className="mt-1 block text-xs text-muted-foreground">
                      A taxa é calculada pela localização; o horário será definido pela equipa.
                    </span>
                  </label>
                  <label
                    className={`cursor-pointer rounded-lg border p-4 text-sm ${type === "takeaway" ? "border-brand bg-accent" : ""}`}
                  >
                    <input
                      type="radio"
                      name="type"
                      checked={type === "takeaway"}
                      onChange={() => setType("takeaway")}
                      className="mr-2"
                    />
                    <strong>Take-away</strong> (levantar)
                  </label>
                </div>
                {type === "entrega" ? (
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div>
                      <span className="mb-1 block text-sm font-medium text-foreground">
                        Localização
                      </span>
                      <AppSelect
                        value={effectiveDeliveryZoneId}
                        onValueChange={setDeliveryZoneId}
                        options={deliveryZoneOptions}
                        ariaLabel="Localização da entrega"
                        placeholder={
                          deliveryZonesQuery.isPending
                            ? "A carregar localizações..."
                            : "Selecione a localização"
                        }
                        disabled={
                          deliveryZonesQuery.isPending ||
                          deliveryZonesQuery.isError ||
                          deliveryZones.length === 0
                        }
                        required
                        className="w-full"
                      />
                      {deliveryZonesQuery.isError ? (
                        <span className="mt-2 block text-xs font-medium text-red-700">
                          Não foi possível carregar as localizações. Tente novamente.
                        </span>
                      ) : deliveryZones.length === 0 && !deliveryZonesQuery.isPending ? (
                        <span className="mt-2 block text-xs font-medium text-amber-700">
                          As entregas estão temporariamente indisponíveis.
                        </span>
                      ) : selectedDeliveryZone ? (
                        <span className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                          Taxa para {selectedDeliveryZone.name}:{" "}
                          {formatMoney(selectedDeliveryZone.fee_cents)}
                        </span>
                      ) : null}
                    </div>
                    <Field label="Morada detalhada">
                      <input
                        required
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        className="input"
                        placeholder="Rua, número da casa e referência"
                        maxLength={300}
                      />
                    </Field>
                  </div>
                ) : null}
                <div className="mt-4">
                  <Field label="Notas (opcional)">
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="input min-h-[70px]"
                      maxLength={500}
                    />
                  </Field>
                </div>
              </div>

              <button
                type="submit"
                disabled={!canSubmit}
                className="w-full rounded-md bg-brand px-4 py-3 text-base font-semibold text-brand-foreground disabled:opacity-50"
              >
                {mutation.isPending
                  ? "A enviar..."
                  : `Confirmar pedido · ${formatMoney(orderTotalCents)}`}
              </button>
            </form>
          )}
        </div>

        <aside className="h-fit rounded-xl border bg-card p-5 md:sticky md:top-24">
          <h2 className="font-semibold">O seu carrinho</h2>
          <ul className="mt-4 space-y-3">
            {items.map((i) => (
              <li key={i.id} className="flex items-center gap-3">
                <ProductImage
                  src={i.image_url}
                  name={i.name}
                  sizes="48px"
                  className="h-12 w-12 flex-shrink-0 rounded-md"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium">{i.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatMoney(i.price_cents)} × {i.quantity}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label={`Diminuir quantidade de ${i.name}`}
                    onClick={() => setQty(i.id, i.quantity - 1)}
                    className="grid h-7 w-7 place-items-center rounded border hover:bg-muted"
                  >
                    <Minus aria-hidden="true" className="h-3 w-3" />
                  </button>
                  <span className="w-6 text-center text-sm">{i.quantity}</span>
                  <button
                    type="button"
                    aria-label={`Aumentar quantidade de ${i.name}`}
                    onClick={() => setQty(i.id, i.quantity + 1)}
                    className="grid h-7 w-7 place-items-center rounded border hover:bg-muted"
                  >
                    <Plus aria-hidden="true" className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Remover ${i.name} do pedido`}
                    onClick={() => remove(i.id)}
                    className="ml-1 grid h-7 w-7 place-items-center rounded text-muted-foreground hover:text-brand"
                  >
                    <Trash2 aria-hidden="true" className="h-3 w-3" />
                  </button>
                </div>
              </li>
            ))}
            {items.length === 0 && <li className="text-sm text-muted-foreground">Sem itens.</li>}
          </ul>
          <div className="mt-4 space-y-2 border-t pt-4 text-sm">
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Produtos</span>
              <span>{formatMoney(total_cents)}</span>
            </div>
            {type === "entrega" ? (
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Taxa de entrega</span>
                <span
                  className={
                    selectedDeliveryZone
                      ? "font-medium text-foreground"
                      : "font-medium text-amber-700"
                  }
                >
                  {selectedDeliveryZone ? formatMoney(deliveryFeeCents) : "Selecione a localização"}
                </span>
              </div>
            ) : null}
            <div className="flex items-center justify-between border-t pt-2 font-semibold">
              <span>Total</span>
              <span className="font-display text-lg text-navy">{formatMoney(orderTotalCents)}</span>
            </div>
          </div>
        </aside>
      </div>
      <SiteFooter />
      <style>{`.input{width:100%;border-radius:0.5rem;border:1px solid var(--color-border);background:var(--color-background);padding:0.55rem 0.75rem;font-size:0.875rem;outline:none}
      .input:focus{border-color:var(--color-brand);box-shadow:0 0 0 3px oklch(0.62 0.21 22 / 0.15)}`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}

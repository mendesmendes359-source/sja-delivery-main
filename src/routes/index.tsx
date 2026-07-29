import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { ProductImage } from "@/components/product-image";
import { formatMoney } from "@/lib/format";
import { useCart } from "@/lib/cart";
import { toast } from "sonner";
import { ArrowRight, Clock, MapPin, Truck } from "lucide-react";

const featuredQO = queryOptions({
  queryKey: ["menu", "featured"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("menu_items")
      .select("id, name, description, price_cents, image_url")
      .eq("available", true)
      .in("name", ["SJA Clássico", "Bacon Cheese", "SJA Especial"])
      .order("sort_order")
      .limit(3);
    if (error) throw error;
    return data ?? [];
  },
});

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SJA Fast Food — Hambúrgueres e Sandes em Luanda" },
      {
        name: "description",
        content:
          "Peça online no SJA Fast Food. Hambúrgueres, sandes e sabores locais com entrega em Luanda ou take-away.",
      },
      { property: "og:title", content: "SJA Fast Food" },
      {
        property: "og:description",
        content: "Hambúrgueres, sandes e fast food. Entrega rápida ou take-away.",
      },
    ],
  }),
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(featuredQO);
  },
  component: Home,
});

function Home() {
  const { data: featured } = useSuspenseQuery(featuredQO);
  const { add } = useCart();

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <section className="mx-auto max-w-6xl px-4 pt-16 pb-20 md:pt-24 md:pb-28">
        <div className="grid gap-10 md:grid-cols-2 md:items-center">
          <div>
            <span className="inline-flex items-center rounded-full bg-accent px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brand">
              Feito na hora · entrega em 30 min
            </span>
            <h1 className="mt-4 font-display text-5xl md:text-6xl font-bold leading-[1.05] tracking-tight">
              Grande no <span className="text-brand">sabor</span>, rápido a chegar.
            </h1>
            <p className="mt-5 max-w-lg text-lg text-muted-foreground">
              Hambúrgueres suculentos, sandes generosas e sabores tropicais. Escolha, peça online e
              receba em casa ou levante ao balcão.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/menu"
                className="inline-flex items-center gap-2 rounded-md bg-brand px-6 py-3 text-sm font-semibold text-brand-foreground hover:opacity-90"
              >
                Ver menu <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/checkout"
                className="inline-flex items-center gap-2 rounded-md border px-6 py-3 text-sm font-semibold hover:bg-muted"
              >
                Ir para o carrinho
              </Link>
            </div>
            <div className="mt-10 grid grid-cols-3 gap-4 max-w-md">
              <Feature icon={<Clock className="h-4 w-4" />} label="30 min" />
              <Feature icon={<Truck className="h-4 w-4" />} label="Entrega" />
              <Feature icon={<MapPin className="h-4 w-4" />} label="Take-away" />
            </div>
          </div>

          <div className="relative overflow-hidden rounded-3xl shadow-xl">
            <img
              src="/images/menu/hero-combo.jpg"
              alt="Menu SJA com hambúrguer, batatas e sumo de maracujá"
              width={1200}
              height={872}
              fetchPriority="high"
              className="aspect-square h-full w-full object-cover md:aspect-[4/5]"
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-navy/95 via-navy/60 to-transparent px-6 pb-6 pt-20 text-white">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/75">
                Combo da casa
              </p>
              <p className="mt-1 font-display text-2xl font-bold">Sabor que se vê</p>
            </div>
            <span className="absolute right-4 top-4 rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-navy shadow-sm">
              Aberto hoje
            </span>
          </div>
        </div>
      </section>

      <section className="border-y bg-muted/30 py-16">
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex items-end justify-between">
            <div>
              <div className="text-sm font-semibold uppercase tracking-wider text-brand">
                Destaques
              </div>
              <h2 className="mt-2 font-display text-3xl md:text-4xl font-bold">
                Os favoritos da casa
              </h2>
            </div>
            <Link
              to="/menu"
              className="hidden md:inline-flex items-center gap-1 text-sm font-medium text-navy hover:text-brand"
            >
              Ver tudo <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {featured.map((item, index) => (
              <article
                key={item.id}
                className="group rounded-2xl border bg-card p-6 transition hover:border-brand hover:shadow-md"
              >
                <ProductImage
                  src={item.image_url}
                  name={item.name}
                  eager={index === 0}
                  sizes="(min-width: 768px) 33vw, 100vw"
                  className="aspect-[4/3] w-full rounded-xl"
                  imageClassName="transition duration-500 group-hover:scale-105"
                />
                <h3 className="mt-4 font-display text-xl font-semibold">{item.name}</h3>
                {item.description && (
                  <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                    {item.description}
                  </p>
                )}
                <div className="mt-4 flex items-center justify-between">
                  <span className="font-display text-lg font-bold text-navy">
                    {formatMoney(item.price_cents)}
                  </span>
                  <button
                    onClick={() => {
                      add({
                        id: item.id,
                        name: item.name,
                        price_cents: item.price_cents,
                        image_url: item.image_url,
                      });
                      toast.success(`${item.name} adicionado`);
                    }}
                    className="rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-brand-foreground hover:opacity-90"
                  >
                    Adicionar
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

function Feature({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2 text-center text-sm">
      <div className="mx-auto mb-1 grid h-6 w-6 place-items-center rounded-full bg-accent text-brand">
        {icon}
      </div>
      <span className="font-medium">{label}</span>
    </div>
  );
}

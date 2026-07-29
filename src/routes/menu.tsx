import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { ProductImage } from "@/components/product-image";
import { formatMoney } from "@/lib/format";
import { useCart } from "@/lib/cart";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import type { RouteLoaderArgs } from "@/router-context";

const menuQO = queryOptions({
  queryKey: ["menu", "full"],
  queryFn: async () => {
    const [cats, items] = await Promise.all([
      supabase.from("categories").select("id, name, slug, sort_order").order("sort_order"),
      supabase
        .from("menu_items")
        .select("id, category_id, name, description, price_cents, available, sort_order, image_url")
        .eq("available", true)
        .order("sort_order"),
    ]);
    if (cats.error) throw cats.error;
    if (items.error) throw items.error;
    return { categories: cats.data ?? [], items: items.data ?? [] };
  },
});

export const Route = createFileRoute("/menu")({
  head: () => ({
    meta: [
      { title: "Menu — SJA Fast Food Luanda" },
      {
        name: "description",
        content:
          "Consulte o menu completo do SJA Fast Food: hambúrgueres, sandes, acompanhamentos, bebidas e sobremesas.",
      },
      { property: "og:title", content: "Menu — SJA Fast Food" },
      { property: "og:description", content: "O menu completo do SJA Fast Food." },
    ],
  }),
  loader: ({ context }: RouteLoaderArgs) => {
    context.queryClient.ensureQueryData(menuQO);
  },
  component: MenuPage,
});

function MenuPage() {
  const { data } = useSuspenseQuery(menuQO);
  const { add, count } = useCart();

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-sm font-semibold uppercase tracking-wider text-brand">Menu</div>
            <h1 className="mt-2 font-display text-4xl md:text-5xl font-bold">O nosso menu</h1>
            <p className="mt-2 max-w-xl text-muted-foreground">
              Escolha os seus favoritos e adicione ao carrinho. {data.items.length} opções
              preparadas na hora.
            </p>
          </div>
          {count > 0 && (
            <Link
              to="/checkout"
              className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground hover:opacity-90"
            >
              Ver carrinho ({count})
            </Link>
          )}
        </div>

        <div className="mt-6 flex flex-wrap gap-2 border-b pb-4">
          {data.categories.map((c) => (
            <a
              key={c.id}
              href={`#${c.slug}`}
              className="rounded-full border px-4 py-1.5 text-sm font-medium hover:border-brand hover:text-brand"
            >
              {c.name}
            </a>
          ))}
        </div>

        <div className="mt-8 space-y-14">
          {data.categories.map((cat) => {
            const items = data.items.filter((i) => i.category_id === cat.id);
            if (!items.length) return null;
            return (
              <section key={cat.id} id={cat.slug} className="scroll-mt-28">
                <h2 className="font-display text-2xl font-bold text-navy">{cat.name}</h2>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  {items.map((item) => (
                    <article
                      key={item.id}
                      className="group flex gap-4 rounded-xl border bg-card p-4 transition hover:border-brand hover:shadow-sm"
                    >
                      <ProductImage
                        src={item.image_url}
                        name={item.name}
                        sizes="112px"
                        className="h-28 w-28 flex-shrink-0 rounded-lg"
                        imageClassName="transition duration-300 group-hover:scale-105"
                      />
                      <div className="flex flex-1 flex-col">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-semibold">{item.name}</h3>
                          <span className="font-display font-bold text-navy">
                            {formatMoney(item.price_cents)}
                          </span>
                        </div>
                        {item.description && (
                          <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                            {item.description}
                          </p>
                        )}
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
                          className="mt-auto self-start inline-flex items-center gap-1 rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-brand-foreground hover:opacity-90"
                        >
                          <Plus className="h-4 w-4" /> Adicionar
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}

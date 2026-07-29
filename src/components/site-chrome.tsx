import { Link } from "@tanstack/react-router";
import { useCart } from "@/lib/cart";
import { LockKeyhole, ShoppingBag } from "lucide-react";

export function SiteHeader() {
  const { count } = useCart();
  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:py-4">
        <Link to="/" className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-md bg-brand font-display text-lg font-bold text-brand-foreground">
            S
          </span>
          <span className="font-display text-xl font-bold tracking-tight">
            SJA{" "}
            <span className="hidden font-normal text-muted-foreground sm:inline">fast food</span>
          </span>
        </Link>
        <nav className="flex items-center gap-1 text-sm font-medium md:gap-2">
          <Link
            to="/"
            className="hidden rounded-md px-3 py-2 hover:bg-muted sm:block [&.active]:text-brand"
            activeOptions={{ exact: true }}
          >
            Início
          </Link>
          <Link to="/menu" className="rounded-md px-3 py-2 hover:bg-muted [&.active]:text-brand">
            Menu
          </Link>
          <Link
            to="/checkout"
            className="ml-1 inline-flex items-center gap-2 rounded-md bg-brand px-3 py-2 text-brand-foreground hover:opacity-90 sm:ml-2 sm:px-4"
          >
            <ShoppingBag className="h-4 w-4" />
            Carrinho
            {count > 0 && (
              <span className="rounded-full bg-brand-foreground/20 px-2 text-xs">{count}</span>
            )}
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t bg-muted/40">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 text-sm text-muted-foreground md:grid-cols-4">
        <div>
          <div className="font-display text-lg font-bold text-foreground">SJA Fast Food</div>
          <p className="mt-2">Hambúrgueres, sandes e sabores feitos na hora em Luanda.</p>
        </div>
        <div>
          <div className="font-semibold text-foreground">Horário</div>
          <p className="mt-2">Todos os dias · 11h30 — 23h00</p>
        </div>
        <div>
          <div className="font-semibold text-foreground">Contactos</div>
          <p className="mt-2">Talatona, Luanda</p>
          <p>+244 923 000 000</p>
        </div>
        <div>
          <div className="font-semibold text-foreground">Backoffice</div>
          <p className="mt-2">Gestão de pedidos, entregas e stock.</p>
          <Link
            to="/auth"
            className="mt-3 inline-flex items-center gap-2 rounded-md border bg-background px-3 py-2 font-medium text-foreground transition-colors hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            <LockKeyhole className="h-4 w-4" aria-hidden="true" />
            Aceder ao backoffice
          </Link>
        </div>
      </div>
      <div className="border-t py-4 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} SJA Fast Food
      </div>
    </footer>
  );
}

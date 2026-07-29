import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  LayoutDashboard,
  ClipboardList,
  Truck,
  UtensilsCrossed,
  Package,
  PiggyBank,
  MessageSquare,
  LogOut,
  ExternalLink,
  Users,
  Menu as MenuIcon,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async () => {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) throw redirect({ to: "/auth" });

    const { data: roles, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id);

    const role = roles?.some((entry) => entry.role === "admin")
      ? "admin"
      : roles?.some((entry) => entry.role === "staff")
        ? "staff"
        : null;

    if (roleError || !role) {
      await supabase.auth.signOut();
      throw redirect({ to: "/auth" });
    }

    return { role };
  },
  component: AdminLayout,
});

type NavLink = { to: string; label: string; icon: typeof LayoutDashboard; exact?: boolean };
const links: NavLink[] = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/admin/pedidos", label: "Pedidos", icon: ClipboardList },
  { to: "/admin/entregas", label: "Entregas", icon: Truck },
  { to: "/admin/menu", label: "Menu", icon: UtensilsCrossed },
  { to: "/admin/stock", label: "Stock", icon: Package },
  { to: "/admin/financeiro", label: "Financeiro", icon: PiggyBank },
  { to: "/admin/sms", label: "SMS", icon: MessageSquare },
  { to: "/admin/utilizadores", label: "Utilizadores", icon: Users },
];

const SIDEBAR_STORAGE_KEY = "sja-admin-sidebar-v1";

type NavigationLinksProps = {
  items: NavLink[];
  pathname: string;
  collapsed?: boolean;
  onNavigate?: () => void;
};

function NavigationLinks({ items, pathname, collapsed = false, onNavigate }: NavigationLinksProps) {
  return items.map((item) => {
    const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
    const Icon = item.icon;

    return (
      <Link
        key={item.to}
        to={item.to as string}
        activeOptions={{ exact: item.exact }}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        title={collapsed ? item.label : undefined}
        className={cn(
          "flex min-h-10 items-center rounded-md px-3 py-2 text-sm transition-colors",
          collapsed ? "justify-center" : "gap-3",
          active ? "bg-sidebar-accent font-semibold" : "hover:bg-sidebar-accent/60",
        )}
      >
        <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
        <span className={collapsed ? "sr-only" : undefined}>{item.label}</span>
      </Link>
    );
  });
}

function AdminLayout() {
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state: { location: { pathname: string } }) => state.location.pathname,
  });
  const { role } = Route.useRouteContext();
  const visibleLinks =
    role === "admin" ? links : links.filter((link) => link.to !== "/admin/utilizadores");
  const currentModule =
    visibleLinks.find((link) => (link.exact ? pathname === link.to : pathname.startsWith(link.to)))
      ?.label ?? "Backoffice";
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "collapsed";
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  function toggleSidebar() {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? "collapsed" : "expanded");
      return next;
    });
  }

  async function signOut() {
    await supabase.auth.signOut();
    toast.success("Sessão terminada");
    navigate({ to: "/auth" });
  }

  return (
    <div
      className={cn(
        "min-h-screen bg-muted/30 md:grid md:transition-[grid-template-columns] md:duration-200",
        collapsed ? "md:grid-cols-[76px_1fr]" : "md:grid-cols-[240px_1fr]",
      )}
    >
      <aside className="sticky top-0 hidden h-screen flex-col bg-sidebar text-sidebar-foreground md:flex">
        <div
          className={cn(
            "flex border-b border-sidebar-border",
            collapsed ? "flex-col items-center gap-2 px-2 py-4" : "items-center gap-2 px-4 py-5",
          )}
        >
          <div
            className={cn(
              "flex items-center",
              collapsed ? "justify-center" : "min-w-0 flex-1 gap-2",
            )}
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-brand font-display text-lg font-bold text-brand-foreground">
              S
            </span>
            {collapsed ? null : (
              <span className="truncate font-display text-lg font-bold">SJA · Admin</span>
            )}
          </div>
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={collapsed ? "Expandir menu lateral" : "Recolher menu lateral"}
            aria-expanded={!collapsed}
            title={collapsed ? "Expandir menu" : "Recolher menu"}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-sidebar-foreground/80 transition hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          >
            {collapsed ? (
              <PanelLeftOpen className="h-5 w-5" aria-hidden="true" />
            ) : (
              <PanelLeftClose className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          <NavigationLinks items={visibleLinks} pathname={pathname} collapsed={collapsed} />
        </nav>
        <div className="space-y-1 border-t border-sidebar-border p-3">
          <Link
            to="/"
            title={collapsed ? "Ver site" : undefined}
            className={cn(
              "flex min-h-10 items-center rounded-md px-3 py-2 text-sm hover:bg-sidebar-accent/60",
              collapsed ? "justify-center" : "gap-3",
            )}
          >
            <ExternalLink className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span className={collapsed ? "sr-only" : undefined}>Ver site</span>
          </Link>
          <button
            type="button"
            onClick={signOut}
            title={collapsed ? "Sair" : undefined}
            className={cn(
              "flex min-h-10 w-full items-center rounded-md px-3 py-2 text-sm hover:bg-sidebar-accent/60",
              collapsed ? "justify-center" : "gap-3",
            )}
          >
            <LogOut className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span className={collapsed ? "sr-only" : undefined}>Sair</span>
          </button>
        </div>
      </aside>

      <header className="sticky top-0 z-40 flex items-center justify-between bg-sidebar px-4 py-3 text-sidebar-foreground md:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Abrir menu dos módulos"
          aria-expanded={mobileOpen}
          className="grid h-10 w-10 place-items-center rounded-md hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          <MenuIcon className="h-5 w-5" aria-hidden="true" />
        </button>
        <div className="min-w-0 px-3 text-center">
          <div className="truncate text-xs text-sidebar-foreground/70">SJA Admin</div>
          <div className="truncate font-display text-sm font-semibold">{currentModule}</div>
        </div>
        <button
          type="button"
          onClick={signOut}
          aria-label="Terminar sessão"
          title="Sair"
          className="grid h-10 w-10 place-items-center rounded-md hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          <LogOut className="h-5 w-5" aria-hidden="true" />
        </button>
      </header>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className="flex w-[290px] flex-col border-sidebar-border bg-sidebar p-0 text-sidebar-foreground [&>button]:text-sidebar-foreground"
        >
          <SheetHeader className="border-b border-sidebar-border px-5 py-5 text-left">
            <SheetTitle className="flex items-center gap-3 font-display text-sidebar-foreground">
              <span className="grid h-9 w-9 place-items-center rounded-md bg-brand text-lg font-bold text-brand-foreground">
                S
              </span>
              SJA · Admin
            </SheetTitle>
            <SheetDescription className="text-sidebar-foreground/65">
              Navegação do backoffice
            </SheetDescription>
          </SheetHeader>
          <nav className="flex-1 space-y-1 overflow-y-auto p-3">
            <NavigationLinks
              items={visibleLinks}
              pathname={pathname}
              onNavigate={() => setMobileOpen(false)}
            />
          </nav>
          <div className="space-y-1 border-t border-sidebar-border p-3">
            <Link
              to="/"
              onClick={() => setMobileOpen(false)}
              className="flex min-h-10 items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-sidebar-accent/60"
            >
              <ExternalLink className="h-5 w-5" aria-hidden="true" />
              Ver site
            </Link>
            <button
              type="button"
              onClick={signOut}
              className="flex min-h-10 w-full items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-sidebar-accent/60"
            >
              <LogOut className="h-5 w-5" aria-hidden="true" />
              Sair
            </button>
          </div>
        </SheetContent>
      </Sheet>

      <main className="p-4 md:p-8">
        <Outlet />
      </main>
    </div>
  );
}

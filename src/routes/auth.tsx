import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { BrandLogo } from "@/components/brand-logo";

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => {
    const redirect = sanitizeRedirect(search.redirect);
    return redirect ? { redirect } : {};
  },
  head: () => ({
    meta: [
      { title: "Área de gestão — SJA Fast Food" },
      { name: "description", content: "Aceder ao backoffice do SJA Fast Food." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function sanitizeRedirect(value: unknown) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
    ? value
    : null;
}

async function getAuthenticatedDestination(userId: string, requestedPath: string | null) {
  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);

  if (roles?.some((entry) => entry.role === "estafeta")) return "/estafeta";
  return requestedPath?.startsWith("/admin") ? requestedPath : "/admin";
}

function AuthPage() {
  const navigate = useNavigate();
  const requestedPath = Route.useSearch().redirect ?? null;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (active && data.session) {
        getAuthenticatedDestination(data.session.user.id, requestedPath).then((to) => {
          if (active) navigate({ to, replace: true });
        });
      }
    });

    return () => {
      active = false;
    };
  }, [navigate, requestedPath]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast.success("Sessão iniciada");
      navigate({ to: await getAuthenticatedDestination(data.user.id, requestedPath) });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-muted/30 grid place-items-center px-4">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 shadow-sm">
        <div className="text-center">
          <BrandLogo className="mx-auto h-16 w-16" alt="Logótipo SJA Fast Food" />
          <h1 className="mt-4 font-display text-2xl font-bold">Área de gestão SJA</h1>
          <p className="mt-1 text-sm text-muted-foreground">Entre com o seu email e senha</p>
        </div>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block text-sm font-medium">
            Email
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@sja.pt"
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </label>
          <label className="block text-sm font-medium">
            Senha
            <input
              type="password"
              required
              minLength={8}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-brand py-2.5 text-sm font-semibold text-brand-foreground disabled:opacity-50"
          >
            {loading ? "A processar..." : "Entrar"}
          </button>
        </form>
        <p className="mt-6 text-center text-[11px] text-muted-foreground">
          As contas de acesso são criadas por um administrador.
        </p>
      </div>
    </div>
  );
}

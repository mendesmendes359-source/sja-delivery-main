import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Bike, KeyRound, ShieldCheck, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { AppSelect } from "@/components/ui/app-select";
import { formatDate } from "@/lib/format";
import {
  createManagedUser,
  listUsers,
  resetManagedUserPassword,
  updateManagedUserRole,
  updateManagedUserStatus,
} from "@/lib/users.functions";

type Role = "admin" | "staff" | "estafeta";

const emptyUser = {
  name: "",
  email: "",
  password: "",
  role: "staff" as Role,
};

const ROLE_OPTIONS = [
  { value: "staff", label: "Colaborador" },
  { value: "estafeta", label: "Estafeta" },
  { value: "admin", label: "Administrador" },
] as const;

export const Route = createFileRoute("/_authenticated/admin/utilizadores")({
  beforeLoad: ({ context }: { context: { role?: "admin" | "staff" } }) => {
    if (context.role !== "admin") throw redirect({ to: "/admin" });
  },
  component: UsersAdmin,
});

function UsersAdmin() {
  const queryClient = useQueryClient();
  const [newUser, setNewUser] = useState(emptyUser);
  const [resetPassword, setResetPassword] = useState<{
    id: string;
    email: string;
    password: string;
  } | null>(null);

  const listUsersFn = useServerFn(listUsers);
  const createUserFn = useServerFn(createManagedUser);
  const updateRoleFn = useServerFn(updateManagedUserRole);
  const updateStatusFn = useServerFn(updateManagedUserStatus);
  const resetPasswordFn = useServerFn(resetManagedUserPassword);

  const usersQuery = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => listUsersFn(),
  });

  const refreshUsers = () => queryClient.invalidateQueries({ queryKey: ["admin", "users"] });

  const createUserMutation = useMutation({
    mutationFn: () => createUserFn({ data: newUser }),
    onSuccess: async () => {
      await refreshUsers();
      setNewUser(emptyUser);
      toast.success("Utilizador criado e pronto para entrar");
    },
    onError: showError,
  });

  const roleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: Role }) =>
      updateRoleFn({ data: { userId, role } }),
    onSuccess: async () => {
      await refreshUsers();
      toast.success("Função actualizada");
    },
    onError: showError,
  });

  const statusMutation = useMutation({
    mutationFn: ({ userId, active }: { userId: string; active: boolean }) =>
      updateStatusFn({ data: { userId, active } }),
    onSuccess: async (_, variables) => {
      await refreshUsers();
      toast.success(variables.active ? "Utilizador reactivado" : "Utilizador desactivado");
    },
    onError: showError,
  });

  const passwordMutation = useMutation({
    mutationFn: (input: { userId: string; password: string }) => resetPasswordFn({ data: input }),
    onSuccess: () => {
      setResetPassword(null);
      toast.success("Senha actualizada");
    },
    onError: showError,
  });

  const users = usersQuery.data ?? [];
  const activeUsers = users.filter((user) => user.active).length;
  const admins = users.filter((user) => user.role === "admin").length;
  const couriers = users.filter((user) => user.role === "estafeta").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Utilizadores</h1>
        <p className="text-sm text-muted-foreground">
          Registo, permissões e controlo de acesso ao backoffice
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Summary icon={<Users className="h-4 w-4" />} label="Total" value={users.length} />
        <Summary
          icon={<ShieldCheck className="h-4 w-4" />}
          label="Administradores"
          value={admins}
        />
        <Summary icon={<Bike className="h-4 w-4" />} label="Estafetas" value={couriers} />
        <Summary
          icon={<UserPlus className="h-4 w-4" />}
          label="Contas activas"
          value={activeUsers}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <section className="overflow-hidden rounded-xl border bg-card">
          <div className="border-b px-5 py-4">
            <h2 className="font-semibold">Contas registadas</h2>
          </div>

          {usersQuery.isPending ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              A carregar utilizadores...
            </p>
          ) : usersQuery.isError ? (
            <div className="p-8 text-center text-sm">
              <p className="font-medium text-brand">Não foi possível carregar os utilizadores.</p>
              <p className="mt-1 text-muted-foreground">{getErrorMessage(usersQuery.error)}</p>
              <button
                type="button"
                onClick={() => usersQuery.refetch()}
                className="mt-4 rounded-md border px-3 py-2 font-medium hover:bg-muted"
              >
                Tentar novamente
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Utilizador</th>
                    <th className="px-4 py-3">Função</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3">Último acesso</th>
                    <th className="px-4 py-3 text-right">Acções</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td className="px-4 py-3">
                        <div className="font-medium">
                          {user.name || "Sem nome"}
                          {user.isCurrentUser ? (
                            <span className="ml-2 text-xs text-muted-foreground">(você)</span>
                          ) : null}
                        </div>
                        <div className="text-xs text-muted-foreground">{user.email}</div>
                      </td>
                      <td className="px-4 py-3">
                        <AppSelect
                          value={user.role ?? "staff"}
                          disabled={user.isCurrentUser || roleMutation.isPending}
                          onValueChange={(role) =>
                            roleMutation.mutate({
                              userId: user.id,
                              role: role as Role,
                            })
                          }
                          options={ROLE_OPTIONS}
                          ariaLabel={`Função de ${user.email}`}
                          size="sm"
                          className="min-w-36"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-medium ${
                            user.active ? "bg-accent text-brand" : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {user.active ? "Activo" : "Desactivado"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                        {user.lastSignInAt ? formatDate(user.lastSignInAt) : "Nunca"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            aria-label={`Alterar senha de ${user.email}`}
                            onClick={() =>
                              setResetPassword({
                                id: user.id,
                                email: user.email,
                                password: "",
                              })
                            }
                            className="rounded-md border p-2 hover:bg-muted"
                          >
                            <KeyRound className="h-4 w-4" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            disabled={user.isCurrentUser || statusMutation.isPending}
                            onClick={() =>
                              statusMutation.mutate({
                                userId: user.id,
                                active: !user.active,
                              })
                            }
                            className="whitespace-nowrap rounded-md border px-3 py-2 text-xs font-medium hover:bg-muted disabled:opacity-50"
                          >
                            {user.active ? "Desactivar" : "Reactivar"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-muted-foreground">
                        Sem utilizadores registados
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="h-fit rounded-xl border bg-card p-5">
          <div className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-brand" aria-hidden="true" />
            <h2 className="font-semibold">Novo utilizador</h2>
          </div>
          <form
            className="mt-4 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              createUserMutation.mutate();
            }}
          >
            <Field label="Nome">
              <input
                required
                autoComplete="name"
                value={newUser.name}
                onChange={(event) => setNewUser({ ...newUser, name: event.target.value })}
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Email">
              <input
                required
                type="email"
                autoComplete="email"
                value={newUser.email}
                onChange={(event) => setNewUser({ ...newUser, email: event.target.value })}
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Senha temporária">
              <input
                required
                type="password"
                minLength={8}
                autoComplete="new-password"
                value={newUser.password}
                onChange={(event) => setNewUser({ ...newUser, password: event.target.value })}
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Função">
              <AppSelect
                value={newUser.role}
                onValueChange={(role) => setNewUser({ ...newUser, role: role as Role })}
                options={ROLE_OPTIONS}
                ariaLabel="Função do novo utilizador"
                className="mt-1"
              />
            </Field>
            <button
              type="submit"
              disabled={createUserMutation.isPending}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-brand px-4 py-2.5 text-sm font-semibold text-brand-foreground disabled:opacity-50"
            >
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              {createUserMutation.isPending ? "A criar..." : "Criar utilizador"}
            </button>
          </form>
        </section>
      </div>

      {resetPassword ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-password-title"
          onClick={() => setResetPassword(null)}
        >
          <form
            className="w-full max-w-md rounded-xl bg-card p-6 shadow-lg"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              passwordMutation.mutate({
                userId: resetPassword.id,
                password: resetPassword.password,
              });
            }}
          >
            <h2 id="reset-password-title" className="font-display text-xl font-bold">
              Alterar senha
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{resetPassword.email}</p>
            <label className="mt-4 block text-sm font-medium">
              Nova senha
              <input
                required
                autoFocus
                type="password"
                minLength={8}
                autoComplete="new-password"
                value={resetPassword.password}
                onChange={(event) =>
                  setResetPassword({
                    ...resetPassword,
                    password: event.target.value,
                  })
                }
                className="mt-1 w-full rounded-md border bg-background px-3 py-2"
              />
            </label>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setResetPassword(null)}
                className="rounded-md border px-4 py-2 text-sm"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={passwordMutation.isPending}
                className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground disabled:opacity-50"
              >
                {passwordMutation.isPending ? "A guardar..." : "Guardar senha"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function Summary({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-xs uppercase tracking-wider">{label}</span>
        <span className="grid h-7 w-7 place-items-center rounded-md bg-accent text-brand">
          {icon}
        </span>
      </div>
      <div className="mt-2 font-display text-2xl font-bold">{value}</div>
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

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Erro inesperado";
}

function showError(error: unknown) {
  toast.error(getErrorMessage(error));
}

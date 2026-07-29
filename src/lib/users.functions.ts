import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

const roleSchema = z.enum(["admin", "staff"]);

const createUserSchema = z.object({
  name: z.string().trim().min(2, "Indique o nome").max(100),
  email: z.string().trim().email("Email inválido").max(255),
  password: z.string().min(8, "A senha deve ter pelo menos 8 caracteres").max(72),
  role: roleSchema,
});

const updateRoleSchema = z.object({
  userId: z.string().uuid(),
  role: roleSchema,
});

const updateStatusSchema = z.object({
  userId: z.string().uuid(),
  active: z.boolean(),
});

const resetPasswordSchema = z.object({
  userId: z.string().uuid(),
  password: z.string().min(8, "A senha deve ter pelo menos 8 caracteres").max(72),
});

async function requireAdmin(context: { supabase: SupabaseClient<Database>; userId: string }) {
  const { data: isAdmin, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });

  if (error || !isAdmin) {
    throw new Error("Apenas administradores podem gerir utilizadores");
  }
}

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [usersResult, rolesResult] = await Promise.all([
      supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      supabaseAdmin.from("user_roles").select("user_id, role"),
    ]);

    if (usersResult.error) throw new Error(usersResult.error.message);
    if (rolesResult.error) throw new Error(rolesResult.error.message);

    const roleByUser = new Map(
      (rolesResult.data ?? []).map((entry) => [entry.user_id, entry.role]),
    );

    return usersResult.data.users.map((user) => ({
      id: user.id,
      name: typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : "",
      email: user.email ?? "",
      role: roleByUser.get(user.id) ?? null,
      active: !user.banned_until || new Date(user.banned_until).getTime() <= Date.now(),
      createdAt: user.created_at,
      lastSignInAt: user.last_sign_in_at ?? null,
      isCurrentUser: user.id === context.userId,
    }));
  });

export const createManagedUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => createUserSchema.parse(data))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.name },
    });

    if (createError || !created.user) {
      throw new Error(createError?.message ?? "Não foi possível criar o utilizador");
    }

    const { error: roleError } = await supabaseAdmin.from("user_roles").insert({
      user_id: created.user.id,
      role: data.role,
    });

    if (roleError) {
      await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      throw new Error(`A conta não foi criada: ${roleError.message}`);
    }

    return { id: created.user.id };
  });

export const updateManagedUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => updateRoleSchema.parse(data))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    if (data.userId === context.userId && data.role !== "admin") {
      throw new Error("Não pode retirar a sua própria função de administrador");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: insertError } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: data.userId, role: data.role }, { onConflict: "user_id,role" });
    if (insertError) throw new Error(insertError.message);

    const { error: cleanupError } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.userId)
      .neq("role", data.role);
    if (cleanupError) throw new Error(cleanupError.message);

    return { ok: true };
  });

export const updateManagedUserStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => updateStatusSchema.parse(data))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    if (data.userId === context.userId && !data.active) {
      throw new Error("Não pode desactivar a sua própria conta");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      ban_duration: data.active ? "none" : "876000h",
    });
    if (error) throw new Error(error.message);

    return { ok: true };
  });

export const resetManagedUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => resetPasswordSchema.parse(data))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.password,
    });
    if (error) throw new Error(error.message);

    return { ok: true };
  });

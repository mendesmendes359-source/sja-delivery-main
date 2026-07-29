export type SupabasePublicConfig = {
  url: string;
  publishableKey: string;
};

export type SupabaseAdminConfig = SupabasePublicConfig & {
  adminKey: string;
};

export function getSupabasePublicConfig(): SupabasePublicConfig {
  const url =
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL;
  const publishableKey =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !publishableKey) {
    const missing = [
      ...(!url ? ["SUPABASE_URL ou VITE_SUPABASE_URL"] : []),
      ...(!publishableKey
        ? ["SUPABASE_PUBLISHABLE_KEY, SUPABASE_ANON_KEY ou VITE_SUPABASE_PUBLISHABLE_KEY"]
        : []),
    ];
    throw new Error(`Configuração pública da Supabase em falta: ${missing.join(", ")}.`);
  }

  return { url, publishableKey };
}

export function getSupabaseAdminConfig(): SupabaseAdminConfig {
  const publicConfig = getSupabasePublicConfig();
  const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

  if (!adminKey) {
    throw new Error(
      "Configuração administrativa da Supabase em falta: defina SUPABASE_SERVICE_ROLE_KEY ou SUPABASE_SECRET_KEY apenas no servidor.",
    );
  }

  return { ...publicConfig, adminKey };
}

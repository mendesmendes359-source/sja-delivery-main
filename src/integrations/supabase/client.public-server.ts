import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

// Server-side client for public operations such as checkout. It intentionally
// uses only the publishable key and therefore never exposes an admin credential.
function createPublicServerClient() {
  const supabaseUrl =
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL;
  const publishableKey =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !publishableKey) {
    const missing = [
      ...(!supabaseUrl ? ["VITE_SUPABASE_URL"] : []),
      ...(!publishableKey ? ["VITE_SUPABASE_PUBLISHABLE_KEY"] : []),
    ];
    throw new Error(`Configuração pública da Supabase em falta: ${missing.join(", ")}`);
  }

  return createClient<Database>(supabaseUrl, publishableKey, {
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

let publicServerClient: ReturnType<typeof createPublicServerClient> | undefined;

export const supabasePublicServer = new Proxy({} as ReturnType<typeof createPublicServerClient>, {
  get(_, property, receiver) {
    if (!publicServerClient) publicServerClient = createPublicServerClient();
    return Reflect.get(publicServerClient, property, receiver);
  },
});

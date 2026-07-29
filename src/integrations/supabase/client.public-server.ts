import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { getSupabasePublicConfig } from "./env.server";

// Server-side client for public operations such as checkout. It intentionally
// uses only the publishable key and therefore never exposes an admin credential.
function createPublicServerClient() {
  const { url, publishableKey } = getSupabasePublicConfig();

  return createClient<Database>(url, publishableKey, {
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

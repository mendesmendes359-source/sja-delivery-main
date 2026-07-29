import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

function createSupabaseFetch(supabaseKey) {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    if (
      supabaseKey.startsWith("sb_secret_") &&
      headers.get("Authorization") === `Bearer ${supabaseKey}`
    ) {
      headers.delete("Authorization");
    }

    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

async function readEnvFile(path) {
  try {
    const content = await readFile(path, "utf8");
    return Object.fromEntries(
      content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#") && line.includes("="))
        .map((line) => {
          const separator = line.indexOf("=");
          const key = line.slice(0, separator).trim();
          const value = line
            .slice(separator + 1)
            .trim()
            .replace(/^["']|["']$/g, "");
          return [key, value];
        }),
    );
  } catch (error) {
    if (error?.code === "ENOENT") return {};
    throw error;
  }
}

const env = {
  ...(await readEnvFile(".env")),
  ...(await readEnvFile(".env.local")),
  ...process.env,
};

const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const adminKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
const missing = [
  ...(!supabaseUrl ? ["SUPABASE_URL ou VITE_SUPABASE_URL"] : []),
  ...(!adminKey ? ["SUPABASE_SERVICE_ROLE_KEY ou SUPABASE_SECRET_KEY"] : []),
  ...(!env.ADMIN_EMAIL ? ["ADMIN_EMAIL"] : []),
  ...(!env.ADMIN_PASSWORD ? ["ADMIN_PASSWORD"] : []),
];

if (missing.length > 0) {
  console.error(`Faltam variáveis: ${missing.join(", ")}`);
  console.error(
    "Defina a chave de serviço em .env.local e execute com ADMIN_EMAIL, ADMIN_PASSWORD e ADMIN_NAME.",
  );
  process.exit(1);
}

if (env.ADMIN_PASSWORD.length < 8) {
  console.error("ADMIN_PASSWORD deve ter pelo menos 8 caracteres.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, adminKey, {
  global: {
    fetch: createSupabaseFetch(adminKey),
  },
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const email = env.ADMIN_EMAIL.trim().toLowerCase();
const name = env.ADMIN_NAME?.trim() || "Administrador SJA";
const { data: listed, error: listError } = await supabase.auth.admin.listUsers({
  page: 1,
  perPage: 1000,
});

if (listError) throw listError;

let user = listed.users.find((candidate) => candidate.email?.toLowerCase() === email);

if (!user) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: env.ADMIN_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: name },
  });
  if (error || !data.user) {
    throw error ?? new Error("Não foi possível criar o administrador.");
  }
  user = data.user;
} else {
  const { data, error } = await supabase.auth.admin.updateUserById(user.id, {
    password: env.ADMIN_PASSWORD,
    email_confirm: true,
    user_metadata: { ...user.user_metadata, full_name: name },
    ban_duration: "none",
  });
  if (error || !data.user) {
    throw error ?? new Error("Não foi possível actualizar o administrador.");
  }
  user = data.user;
}

const { error: roleError } = await supabase
  .from("user_roles")
  .upsert({ user_id: user.id, role: "admin" }, { onConflict: "user_id,role" });
if (roleError) throw roleError;

const { error: cleanupError } = await supabase
  .from("user_roles")
  .delete()
  .eq("user_id", user.id)
  .neq("role", "admin");
if (cleanupError) throw cleanupError;

console.log(`Administrador pronto: ${email}`);

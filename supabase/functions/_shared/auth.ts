import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export async function requireUserId(req: Request): Promise<string> {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!url || !anon || !authHeader) {
    throw new Error("Unauthorized");
  }

  const client = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) {
    throw new Error("Unauthorized");
  }
  return data.user.id;
}

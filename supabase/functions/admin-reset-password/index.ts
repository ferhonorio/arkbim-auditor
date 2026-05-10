// Edge function: admin-reset-password
// Only Master users can reset another user's password.
// Uses service role internally — never exposed to the client.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ error: "unauthorized" }, 401);

    // Identify caller via anon client + bearer
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);

    const callerId = userData.user.id;

    // Verify caller is master via service-role DB call
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .eq("role", "master")
      .maybeSingle();

    if (!roleRow) return json({ error: "forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const targetUserId = String(body.user_id ?? body.userId ?? "");
    const newPassword = String(body.new_password ?? body.password ?? "");

    if (!targetUserId || newPassword.length < 6) {
      return json({ error: "invalid_input" }, 400);
    }
    if (targetUserId === callerId) {
      return json({ error: "cannot_reset_self" }, 400);
    }

    const { error: updErr } = await admin.auth.admin.updateUserById(targetUserId, {
      password: newPassword,
    });
    if (updErr) {
      console.error("updateUserById failed", updErr);
      return json({ error: "update_failed" }, 500);
    }

    await admin
      .from("profiles")
      .update({ must_change_password: true })
      .eq("id", targetUserId);

    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return json({ error: "internal_error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

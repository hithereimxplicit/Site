import { createClient } from "@supabase/supabase-js";
import { getSupabase, json } from "../lib/montage.mjs";
export async function handler(event) {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." });
  try {
    const { email, password } = JSON.parse(event.body || "{}");
    if (!email || !password) return json(400, { error: "Email and password are required." });
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const signedIn = await client.auth.signInWithPassword({ email: String(email).trim(), password: String(password) });
    if (signedIn.error || !signedIn.data.session) return json(401, { error: "Incorrect email or password." });
    const allowed = await getSupabase().from("montage_admins").select("user_id").eq("user_id", signedIn.data.user.id).maybeSingle();
    if (allowed.error || !allowed.data) return json(403, { error: "This account is not a montage admin." });
    return json(200, { accessToken: signedIn.data.session.access_token, expiresAt: signedIn.data.session.expires_at });
  } catch (error) { console.error("montage-login", error); return json(500, { error: "Login is unavailable right now." }); }
}

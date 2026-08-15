import { getSupabase, json } from "../lib/montage.mjs";
export async function handler(event) {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." });
  try {
    const { submissionId } = JSON.parse(event.body || "{}");
    if (!/^[0-9a-f-]{36}$/i.test(String(submissionId || ""))) return json(400, { error: "Invalid submission." });
    const supabase = getSupabase();
    const result = await supabase.from("montage_submissions").update({ status: "ready", submitted_at: new Date().toISOString() }).eq("id", submissionId).eq("status", "uploading");
    if (result.error) throw result.error;
    return json(200, { ok: true });
  } catch (error) { console.error("montage-complete", error); return json(500, { error: "Upload confirmation failed." }); }
}

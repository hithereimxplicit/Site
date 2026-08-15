import { adminAuthorized, MONTAGE_BUCKET, getSupabase, json } from "../lib/montage.mjs";
export async function handler(event) {
  if (!(await adminAuthorized(event))) return json(401, { error: "Your admin session is invalid or expired." });
  try {
    const supabase = getSupabase();
    if (event.httpMethod === "GET") {
      const fileId = event.queryStringParameters?.file;
      if (fileId) {
        const found = await supabase.from("montage_files").select("storage_path,original_name").eq("id", fileId).single();
        if (found.error) return json(404, { error: "File not found." });
        const signed = await supabase.storage.from(MONTAGE_BUCKET).createSignedUrl(found.data.storage_path, 900, { download: found.data.original_name });
        if (signed.error) throw signed.error;
        return json(200, { url: signed.data.signedUrl, name: found.data.original_name });
      }
      const result = await supabase.from("montage_submissions").select("id,display_name,message,submitted_at,montage_files(id,original_name,mime_type,media_kind,duration_seconds,byte_size)").eq("status", "ready").order("submitted_at", { ascending: false }).limit(200);
      if (result.error) throw result.error;
      return json(200, { submissions: result.data || [] });
    }
    return json(405, { error: "Method not allowed." });
  } catch (error) { console.error("montage-admin", error); return json(500, { error: "Admin request failed." }); }
}

import { adminAuthorized, DROP_BUCKET, getSupabase, json } from "../lib/drop.mjs";

export async function handler(event) {
  if (!adminAuthorized(event)) return json(401, { error: "Incorrect admin key." });
  try {
    const supabase = getSupabase();
    if (event.httpMethod === "GET") {
      const id = event.queryStringParameters?.id;
      const fileId = event.queryStringParameters?.file;
      if (id && fileId) {
        const { data: file, error } = await supabase
          .from("drop_files")
          .select("storage_path, original_name")
          .eq("id", fileId)
          .eq("submission_id", id)
          .single();
        if (error) return json(404, { error: "Photo not found." });
        const signed = await supabase.storage.from(DROP_BUCKET).createSignedUrl(file.storage_path, 300, {
          download: file.original_name,
        });
        if (signed.error) throw signed.error;
        return json(200, { url: signed.data.signedUrl });
      }
      const { data, error } = await supabase
        .from("drop_submissions")
        .select("id, display_name, tiktok_handle, notes, status, created_at, submitted_at, drop_files(id, original_name, mime_type, byte_size)")
        .neq("status", "uploading")
        .order("submitted_at", { ascending: false, nullsFirst: false })
        .limit(100);
      if (error) throw error;
      return json(200, { submissions: data || [] });
    }

    const body = JSON.parse(event.body || "{}");
    if (!/^[0-9a-f-]{36}$/i.test(String(body.id || ""))) return json(400, { error: "Invalid submission." });

    if (event.httpMethod === "PATCH") {
      if (!["new", "editing", "done"].includes(body.status)) return json(400, { error: "Invalid status." });
      const { error } = await supabase.from("drop_submissions").update({ status: body.status }).eq("id", body.id);
      if (error) throw error;
      return json(200, { ok: true });
    }

    if (event.httpMethod === "DELETE") {
      const { data: files, error: filesError } = await supabase
        .from("drop_files").select("storage_path").eq("submission_id", body.id);
      if (filesError) throw filesError;
      if (files?.length) {
        const removed = await supabase.storage.from(DROP_BUCKET).remove(files.map((file) => file.storage_path));
        if (removed.error) throw removed.error;
      }
      const { error } = await supabase.from("drop_submissions").delete().eq("id", body.id);
      if (error) throw error;
      return json(200, { ok: true });
    }

    return json(405, { error: "Method not allowed." });
  } catch (error) {
    console.error("drop-admin", error);
    return json(500, { error: "Admin request failed." });
  }
}


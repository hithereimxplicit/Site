import crypto from "node:crypto";
import {
  adminAuthorized, cleanFileName, DROP_BUCKET, getSupabase, isAllowedImage,
  json, MAX_FILE_BYTES, MAX_FILES,
} from "../lib/drop.mjs";

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
        .select("id, display_name, tiktok_handle, notes, status, created_at, submitted_at, drop_files(id, original_name, mime_type, byte_size), drop_deliveries(number, drop_delivery_files(id, original_name, byte_size))")
        .neq("status", "uploading")
        .order("submitted_at", { ascending: false, nullsFirst: false })
        .limit(100);
      if (error) throw error;
      return json(200, { submissions: data || [] });
    }

    const body = JSON.parse(event.body || "{}");
    if (!/^[0-9a-f-]{36}$/i.test(String(body.id || ""))) return json(400, { error: "Invalid submission." });

    if (event.httpMethod === "POST" && body.action === "start-delivery") {
      const files = Array.isArray(body.files) ? body.files : [];
      if (!files.length || files.length > MAX_FILES) return json(400, { error: `Choose 1–${MAX_FILES} edited photos.` });
      for (const file of files) {
        if (!isAllowedImage(file) || !Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_FILE_BYTES) {
          return json(400, { error: "Each edited file must be a supported image under 50 MB." });
        }
      }
      const existing = await supabase.from("drop_deliveries").select("number").eq("submission_id", body.id).maybeSingle();
      if (existing.error) throw existing.error;
      let delivery = existing.data;
      if (!delivery) {
        const created = await supabase.from("drop_deliveries").insert({ submission_id: body.id }).select("number").single();
        if (created.error) throw created.error;
        delivery = created.data;
      } else {
        const old = await supabase.from("drop_delivery_files").select("storage_path").eq("delivery_number", delivery.number);
        if (old.error) throw old.error;
        if (old.data?.length) await supabase.storage.from(DROP_BUCKET).remove(old.data.map((item) => item.storage_path));
        const cleared = await supabase.from("drop_delivery_files").delete().eq("delivery_number", delivery.number);
        if (cleared.error) throw cleared.error;
      }
      const rows = files.map((file) => {
        const fileId = crypto.randomUUID();
        const name = cleanFileName(file.name);
        return {
          id: fileId,
          delivery_number: delivery.number,
          original_name: name,
          mime_type: String(file.type || "application/octet-stream").slice(0, 120),
          byte_size: Math.round(file.size),
          storage_path: `deliveries/post${delivery.number}/${fileId}-${name}`,
        };
      });
      const inserted = await supabase.from("drop_delivery_files").insert(rows);
      if (inserted.error) throw inserted.error;
      const uploads = [];
      for (const row of rows) {
        const signed = await supabase.storage.from(DROP_BUCKET).createSignedUploadUrl(row.storage_path, { upsert: false });
        if (signed.error) throw signed.error;
        uploads.push({ path: row.storage_path, token: signed.data.token });
      }
      return json(200, {
        number: delivery.number,
        path: `/post${delivery.number}`,
        uploads,
        supabaseUrl: process.env.SUPABASE_URL,
        supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
        bucket: DROP_BUCKET,
      });
    }

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
      const deliveryFiles = await supabase
        .from("drop_delivery_files")
        .select("storage_path, drop_deliveries!inner(submission_id)")
        .eq("drop_deliveries.submission_id", body.id);
      if (deliveryFiles.error) throw deliveryFiles.error;
      if (deliveryFiles.data?.length) {
        const removed = await supabase.storage.from(DROP_BUCKET)
          .remove(deliveryFiles.data.map((file) => file.storage_path));
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

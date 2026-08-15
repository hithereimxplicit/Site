import crypto from "node:crypto";
import { MONTAGE_BUCKET, MAX_MONTAGE_BYTES, MAX_MONTAGE_FILES, cleanName, fileKind, getSupabase, json } from "../lib/montage.mjs";

export async function handler(event) {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." });
  try {
    const body = JSON.parse(event.body || "{}");
    if (body.website) return json(400, { error: "Unable to accept this submission." });
    if (!body.consent) return json(400, { error: "Permission is required." });
    const displayName = String(body.displayName || "").trim().slice(0, 80);
    const message = String(body.message || "").trim().slice(0, 500);
    const files = Array.isArray(body.files) ? body.files : [];
    if (!displayName) return json(400, { error: "Please enter your name." });
    if (!files.length || files.length > MAX_MONTAGE_FILES) return json(400, { error: `Choose 1–${MAX_MONTAGE_FILES} files.` });
    for (const file of files) {
      const kind = fileKind(file);
      if (!kind) return json(400, { error: `${cleanName(file.name)} is not a supported photo or video.` });
      if (!Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_MONTAGE_BYTES) return json(400, { error: `${cleanName(file.name)} must be 150 MB or smaller.` });
      if (kind === "video" && (!Number.isFinite(file.duration) || file.duration <= 0 || file.duration > 10.15)) return json(400, { error: `${cleanName(file.name)} must be 10 seconds or shorter.` });
    }
    const supabase = getSupabase();
    const submissionId = crypto.randomUUID();
    const rows = files.map((file) => {
      const id = crypto.randomUUID(); const originalName = cleanName(file.name); const kind = fileKind(file);
      return { id, submission_id: submissionId, original_name: originalName, mime_type: String(file.type || "application/octet-stream").slice(0, 120), media_kind: kind, duration_seconds: kind === "video" ? Number(file.duration.toFixed(3)) : null, byte_size: Math.round(file.size), storage_path: `montage/${submissionId}/${id}-${originalName}` };
    });
    const inserted = await supabase.from("montage_submissions").insert({ id: submissionId, display_name: displayName, message, status: "uploading" });
    if (inserted.error) throw inserted.error;
    const filesInserted = await supabase.from("montage_files").insert(rows);
    if (filesInserted.error) throw filesInserted.error;
    const uploads = [];
    for (const row of rows) {
      const signed = await supabase.storage.from(MONTAGE_BUCKET).createSignedUploadUrl(row.storage_path, { upsert: false });
      if (signed.error) throw signed.error;
      uploads.push({ id: row.id, path: row.storage_path, token: signed.data.token });
    }
    return json(200, { submissionId, uploads, bucket: MONTAGE_BUCKET, supabaseUrl: process.env.SUPABASE_URL, supabaseAnonKey: process.env.SUPABASE_ANON_KEY });
  } catch (error) { console.error("montage-start", error); return json(500, { error: "Upload could not be started." }); }
}

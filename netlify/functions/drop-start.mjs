import crypto from "node:crypto";
import {
  DROP_BUCKET, MAX_FILES, MAX_FILE_BYTES, cleanFileName, clientIp,
  getSupabase, hashIp, isAllowedImage, json,
} from "../lib/drop.mjs";

export async function handler(event) {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." });
  if (process.env.DROP_OPEN === "false") return json(403, { error: "The photo drop is closed right now." });

  try {
    const body = JSON.parse(event.body || "{}");
    if (body.website) return json(400, { error: "Unable to accept this submission." });
    if (!body.consent) return json(400, { error: "Permission is required before submitting." });
    if (Date.now() - Number(body.startedAt) < 1500) return json(429, { error: "Please wait a moment and try again." });

    const displayName = String(body.displayName || "").trim().slice(0, 60);
    const handle = String(body.handle || "").trim().replace(/^@+/, "").slice(0, 60);
    const notes = String(body.notes || "").trim().slice(0, 500);
    const files = Array.isArray(body.files) ? body.files : [];
    if (!displayName || !handle) return json(400, { error: "Name and TikTok username are required." });
    if (!files.length || files.length > MAX_FILES) {
      return json(400, { error: `Choose between 1 and ${MAX_FILES} photos.` });
    }
    for (const file of files) {
      if (!isAllowedImage(file)) return json(400, { error: `${cleanFileName(file.name)} is not a supported image.` });
      if (!Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_FILE_BYTES) {
        return json(400, { error: `${cleanFileName(file.name)} must be 50 MB or smaller.` });
      }
    }

    const supabase = getSupabase();
    const ipHash = hashIp(clientIp(event));
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { count, error: countError } = await supabase
      .from("drop_submissions")
      .select("id", { count: "exact", head: true })
      .eq("ip_hash", ipHash)
      .gte("created_at", tenMinutesAgo);
    if (countError) throw countError;
    if ((count || 0) >= 3) return json(429, { error: "Too many recent submissions. Try again in a few minutes." });

    const submissionId = crypto.randomUUID();
    const rows = files.map((file) => {
      const id = crypto.randomUUID();
      const filename = cleanFileName(file.name);
      return {
        id,
        submission_id: submissionId,
        original_name: filename,
        mime_type: String(file.type || "application/octet-stream").slice(0, 120),
        byte_size: Math.round(file.size),
        storage_path: `${submissionId}/${id}-${filename}`,
      };
    });

    const { error: submissionError } = await supabase.from("drop_submissions").insert({
      id: submissionId,
      display_name: displayName,
      tiktok_handle: handle,
      notes,
      consent: true,
      status: "uploading",
      ip_hash: ipHash,
    });
    if (submissionError) throw submissionError;

    const { error: filesError } = await supabase.from("drop_files").insert(rows);
    if (filesError) throw filesError;

    const uploads = [];
    for (const row of rows) {
      const { data, error } = await supabase.storage
        .from(DROP_BUCKET)
        .createSignedUploadUrl(row.storage_path, { upsert: false });
      if (error) throw error;
      uploads.push({
        id: row.id,
        name: row.original_name,
        path: row.storage_path,
        token: data.token,
        signedUrl: data.signedUrl,
      });
    }

    return json(200, {
      submissionId,
      uploads,
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
      bucket: DROP_BUCKET,
    });
  } catch (error) {
    console.error("drop-start", error);
    return json(500, { error: "The upload could not be started. Please try again." });
  }
}


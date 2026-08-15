import { createClient } from "@supabase/supabase-js";

export const MONTAGE_BUCKET = process.env.MONTAGE_BUCKET || process.env.DROP_BUCKET || "photo-drops";
export const MAX_MONTAGE_FILES = 30;
export const MAX_MONTAGE_BYTES = 150 * 1024 * 1024;

export function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Montage storage is not configured.");
  return createClient(url, key, { auth: { persistSession: false } });
}

export function json(statusCode, body) {
  return { statusCode, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }, body: JSON.stringify(body) };
}

export function cleanName(value) {
  return String(value || "file").normalize("NFKC").replace(/[^\p{L}\p{N}._ -]/gu, "_").replace(/\s+/g, " ").slice(0, 180) || "file";
}

export function fileKind(file) {
  const type = String(file?.type || "").toLowerCase();
  const name = String(file?.name || "").toLowerCase();
  if (["image/jpeg", "image/png", "image/heic", "image/heif", "image/webp", "image/tiff", "image/dng", "image/x-adobe-dng"].includes(type) || /\.(jpe?g|png|heic|heif|webp|tiff?|dng)$/i.test(name)) return "image";
  if (["video/quicktime", "video/mp4", "video/x-m4v"].includes(type) || /\.(mov|mp4|m4v)$/i.test(name)) return "video";
  return null;
}

export async function adminAuthorized(event) {
  const token = String(event.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return false;
  const supabase = getSupabase();
  const verified = await supabase.auth.getUser(token);
  if (verified.error || !verified.data.user) return false;
  const allowed = await supabase.from("montage_admins").select("user_id").eq("user_id", verified.data.user.id).maybeSingle();
  return !allowed.error && Boolean(allowed.data);
}

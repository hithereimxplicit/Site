import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

export const DROP_BUCKET = process.env.DROP_BUCKET || "photo-drops";
export const MAX_FILES = 3;
export const MAX_FILE_BYTES = 50 * 1024 * 1024;

export function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Drop storage is not configured.");
  return createClient(url, key, { auth: { persistSession: false } });
}

export function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

export function adminAuthorized(event) {
  const expected = process.env.DROP_ADMIN_KEY || process.env.ADMIN_KEY;
  const supplied = event.headers["x-admin-key"];
  if (!expected || !supplied) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function cleanFileName(value) {
  const name = String(value || "photo").normalize("NFKC");
  return name
    .replace(/[^\p{L}\p{N}._ -]/gu, "_")
    .replace(/\s+/g, " ")
    .slice(0, 180) || "photo";
}

export function clientIp(event) {
  return String(
    event.headers["x-nf-client-connection-ip"] ||
    event.headers["x-forwarded-for"] ||
    "unknown"
  ).split(",")[0].trim();
}

export function hashIp(ip) {
  const salt = process.env.DROP_HASH_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return crypto.createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

export function isAllowedImage(file) {
  const type = String(file?.type || "").toLowerCase();
  const name = String(file?.name || "").toLowerCase();
  const allowedTypes = new Set([
    "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif",
    "image/tiff", "image/dng", "image/x-adobe-dng", "image/avif",
  ]);
  return allowedTypes.has(type) ||
    /\.(jpe?g|png|webp|heic|heif|tiff?|dng|avif)$/i.test(name);
}


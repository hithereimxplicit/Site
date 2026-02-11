import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export const handler = async (event) => {
  const token = event.path.split("/").pop();
  if (!token) return { statusCode: 400, body: "Missing token" };

  const { data: row, error: e1 } = await supabase.from("shares").select("*").eq("token", token).maybeSingle();
  if (e1) return { statusCode: 500, body: e1.message };
  if (!row) return { statusCode: 404, body: "Not found" };
  if (row.used) return { statusCode: 410, body: "This link has already been used." };

  // atomic-ish claim
  const { data: claimed, error: e2 } = await supabase
    .from("shares")
    .update({ used: true })
    .eq("token", token)
    .eq("used", false)
    .select()
    .maybeSingle();

  if (e2) return { statusCode: 500, body: e2.message };
  if (!claimed) return { statusCode: 410, body: "This link has already been used." };

  // download
  const dl = await supabase.storage.from("one-time").download(row.path);
  if (dl.error) return { statusCode: 500, body: dl.error.message };

  const buf = Buffer.from(await dl.data.arrayBuffer());

  // delete (best effort)
  try {
    await supabase.storage.from("one-time").remove([row.path]);
  } catch (_) {}

  try {
    await supabase.from("shares").delete().eq("token", token);
  } catch (_) {}

  return {
    statusCode: 200,
    headers: {
      "content-type": row.mime,
      "content-disposition": `attachment; filename="${row.filename}"`,
      "cache-control": "no-store",
    },
    body: buf.toString("base64"),
    isBase64Encoded: true,
  };
};
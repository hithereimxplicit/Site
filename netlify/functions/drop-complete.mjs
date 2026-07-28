import { getSupabase, json } from "../lib/drop.mjs";

export async function handler(event) {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." });
  try {
    const { submissionId } = JSON.parse(event.body || "{}");
    if (!/^[0-9a-f-]{36}$/i.test(String(submissionId || ""))) {
      return json(400, { error: "Invalid submission." });
    }
    const supabase = getSupabase();
    const { data: files, error: fileError } = await supabase
      .from("drop_files")
      .select("storage_path")
      .eq("submission_id", submissionId);
    if (fileError || !files?.length) throw fileError || new Error("Missing files");

    for (const file of files) {
      const { data, error } = await supabase.storage.from(process.env.DROP_BUCKET || "photo-drops").list(
        submissionId,
        { search: file.storage_path.split("/").pop(), limit: 1 }
      );
      if (error || !data?.length) return json(409, { error: "One or more photos did not finish uploading." });
    }

    const { error } = await supabase
      .from("drop_submissions")
      .update({ status: "new", submitted_at: new Date().toISOString() })
      .eq("id", submissionId)
      .eq("status", "uploading");
    if (error) throw error;
    return json(200, { ok: true });
  } catch (error) {
    console.error("drop-complete", error);
    return json(500, { error: "Your photos uploaded, but confirmation failed. Charlie can still recover them." });
  }
}


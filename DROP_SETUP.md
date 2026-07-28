# TikTok photo drop setup

The viewer page is `/drop/`. The private queue is `/drop-admin/`.

## One-time Supabase setup

1. Open the Supabase SQL editor for the project already connected to this site.
2. Run [`supabase/drop-setup.sql`](supabase/drop-setup.sql).

This creates two private tables and a private `photo-drops` storage bucket. Original
files are stored byte-for-byte; the browser never resizes or recompresses them.

## Netlify environment variables

The existing `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are reused. Add:

- `SUPABASE_ANON_KEY`: the project's public/publishable anon key. It authorizes the
  browser to use a short-lived, single-path signed upload token.
- `DROP_ADMIN_KEY`: a long, unique password for `/drop-admin/`. If omitted, the
  existing `ADMIN_KEY` is used.
- `DROP_HASH_SALT`: a long random value used only to hash IPs for rate limiting.
- `DROP_OPEN`: set to `false` to close new submissions; omit it or set `true` to open.
- `DROP_BUCKET`: optional; defaults to `photo-drops`.

Redeploy after changing environment variables.

## Stream workflow

1. Put `charliestimac.site/drop` in the TikTok live caption or link hub.
2. Open `charliestimac.site/drop-admin` on the editing computer.
3. Enter `DROP_ADMIN_KEY`, download an original, and change it to **Editing**.
4. Change it to **Done** after the live edit.
5. Use **Delete** when the original is no longer needed. This permanently removes
   the database record and every uploaded file for that submission.

The current limits are three photos per submission, 50 MB per file, and three
submissions per IP every ten minutes.

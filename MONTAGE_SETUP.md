# Montage upload setup

1. Run `supabase/montage-setup.sql` in the Supabase SQL editor.
2. Confirm the private Storage bucket named by `MONTAGE_BUCKET` exists. If this is
   omitted, the app reuses `DROP_BUCKET`, then falls back to `photo-drops`.
3. Keep these Netlify environment variables configured:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `MONTAGE_BUCKET` (optional)
4. In Supabase Authentication, create your email/password admin user.
5. Add that user to the admin allowlist in the SQL editor:
   ```sql
   insert into public.montage_admins (user_id)
   select id from auth.users where email = 'YOUR_EMAIL_HERE';
   ```
6. Deploy, then share `/montage/`. Open `/montage-admin/` and sign in with that
   Supabase account to manage downloads.

The bucket must remain private. Uploads use short-lived signed upload URLs and
admin downloads use 15-minute signed download URLs. The admin password is managed
by Supabase Authentication and is never stored in Netlify or this repository.

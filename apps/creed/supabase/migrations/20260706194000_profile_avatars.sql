-- Profile avatars for personal users and company Creeds.
--
-- Personal avatars live in auth.users raw_user_meta_data so OAuth defaults and
-- manual overrides use one source. Company avatars live on creeds because the
-- company profile is the shared workspace identity.

alter table public.creeds
  add column if not exists avatar_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'creed-avatars',
  'creed-avatars',
  true,
  3145728,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public read creed avatars" on storage.objects;
create policy "public read creed avatars"
  on storage.objects
  for select
  to public
  using (bucket_id = 'creed-avatars');

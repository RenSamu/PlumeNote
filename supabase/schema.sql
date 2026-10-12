-- Plume — schéma de synchronisation. Peut être exécuté plusieurs fois sans risque
-- (SQL Editor de Supabase → coller → Run).

create table if not exists folders (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null default '',
  created_at bigint, updated_at bigint not null, deleted_at bigint,
  device_id text, purged boolean not null default false,
  synced_at timestamptz not null default clock_timestamp()
);
create table if not exists notes (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  body text not null default '', kind text not null default 'note', date text,
  folder_id text, pinned boolean not null default false,
  created_at bigint, updated_at bigint not null, deleted_at bigint,
  device_id text, purged boolean not null default false,
  synced_at timestamptz not null default clock_timestamp()
);
create table if not exists attachments (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  note_id text, name text, type text, size bigint, kind text, duration double precision,
  storage_path text, created_at bigint, updated_at bigint not null, deleted_at bigint,
  device_id text, purged boolean not null default false,
  synced_at timestamptz not null default clock_timestamp()
);

-- Mise à niveau d'un schéma créé avec la version précédente
alter table folders add column if not exists created_at bigint;
alter table folders add column if not exists purged boolean not null default false;
alter table folders add column if not exists synced_at timestamptz not null default clock_timestamp();
alter table notes add column if not exists purged boolean not null default false;
alter table notes add column if not exists synced_at timestamptz not null default clock_timestamp();
alter table attachments add column if not exists type text;
alter table attachments add column if not exists kind text;
alter table attachments add column if not exists duration double precision;
alter table attachments add column if not exists created_at bigint;
alter table attachments add column if not exists purged boolean not null default false;
alter table attachments add column if not exists synced_at timestamptz not null default clock_timestamp();

-- synced_at est fixé par le serveur à chaque écriture : c'est le curseur de lecture des appareils
create or replace function plume_touch() returns trigger language plpgsql as $$
begin new.synced_at := clock_timestamp(); return new; end $$;
drop trigger if exists plume_touch on folders;
drop trigger if exists plume_touch on notes;
drop trigger if exists plume_touch on attachments;
create trigger plume_touch before insert or update on folders for each row execute function plume_touch();
create trigger plume_touch before insert or update on notes for each row execute function plume_touch();
create trigger plume_touch before insert or update on attachments for each row execute function plume_touch();

create index if not exists folders_sync on folders (user_id, synced_at);
create index if not exists notes_sync on notes (user_id, synced_at);
create index if not exists attachments_sync on attachments (user_id, synced_at);

-- Chaque utilisateur ne voit et ne modifie que ses propres lignes
alter table folders enable row level security;
alter table notes enable row level security;
alter table attachments enable row level security;
drop policy if exists "own folders" on folders;
drop policy if exists "own notes" on notes;
drop policy if exists "own attachments" on attachments;
create policy "own folders" on folders for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own notes" on notes for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own attachments" on attachments for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Fichiers (images, vocaux, PDF) : un dossier par utilisateur dans un espace privé
insert into storage.buckets (id, name, public) values ('attachments', 'attachments', false)
  on conflict (id) do nothing;
drop policy if exists "plume files read" on storage.objects;
drop policy if exists "plume files write" on storage.objects;
drop policy if exists "plume files update" on storage.objects;
drop policy if exists "plume files delete" on storage.objects;
create policy "plume files read" on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "plume files write" on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "plume files update" on storage.objects for update to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "plume files delete" on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);

-- Stratégie : la modification la plus récente (updated_at) l'emporte ; les suppressions sont des
-- tombstones (deleted_at) et purged = vidé définitivement de la corbeille.

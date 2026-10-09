-- Plume — schéma de synchronisation (phase 2). Reflète les enregistrements locaux (IndexedDB).
create table if not exists folders (
  id text primary key, user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null, color text, position int default 0,
  updated_at bigint not null, deleted_at bigint, device_id text
);
create table if not exists notes (
  id text primary key, user_id uuid not null default auth.uid() references auth.users on delete cascade,
  body text not null default '', title text, kind text not null default 'note', date text,
  folder_id text, pinned boolean not null default false, created_at bigint,
  updated_at bigint not null, deleted_at bigint, device_id text
);
create table if not exists attachments (
  id text primary key, user_id uuid not null default auth.uid() references auth.users on delete cascade,
  note_id text, name text, mime text, size bigint, storage_path text,
  updated_at bigint not null, deleted_at bigint, device_id text
);
alter table folders enable row level security;
alter table notes enable row level security;
alter table attachments enable row level security;
create policy "own folders" on folders for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own notes" on notes for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own attachments" on attachments for all using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Stratégie : last-write-wins sur updated_at ; les suppressions sont des tombstones (deleted_at).

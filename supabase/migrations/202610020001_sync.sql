-- Each path is ONE group/member/activity/expense/repayment/snapshot, not app state.
create table public.bopli_documents (
  path text primary key check (length(path) between 1 and 512),
  -- Ordinary stored column: PG logical replication does not reliably publish
  -- generated columns; Realtime needs this value for subscription filtering.
  collection_path text not null check(collection_path=regexp_replace(path, '/[^/]+$', '')),
  data jsonb not null check (jsonb_typeof(data) = 'object')
);
create index bopli_collection_idx on public.bopli_documents(collection_path);
create index bopli_readers_idx on public.bopli_documents using gin ((data->'readerAuthUids')) where collection_path='groups';
create table public.bopli_revision (singleton boolean primary key default true check(singleton), revision bigint not null default 0);
insert into public.bopli_revision values(true,0);

alter table public.bopli_documents enable row level security;
alter table public.bopli_revision enable row level security;
revoke all on public.bopli_documents, public.bopli_revision from public, anon, authenticated;
grant select on public.bopli_documents to authenticated;
grant all on public.bopli_documents, public.bopli_revision to service_role;
-- Clients only discover their groups/epochs. Formal rows use authenticated Edge
-- reads; no direct client writes or access to invites, receipts, or identities.
create policy group_member_read on public.bopli_documents for select to authenticated
using (collection_path='groups' and (data->'readerAuthUids') ? (select auth.uid())::text);

create function public.bopli_read(p_path text default null,p_collection text default null)
returns jsonb language sql security invoker set search_path = '' as $$
  select jsonb_build_object('revision',r.revision,'rows',coalesce((
    select jsonb_agg(jsonb_build_object('path',d.path,'data',d.data) order by d.path)
    from public.bopli_documents d
    where (p_path is not null and d.path=p_path)
       or (p_collection is not null and d.collection_path=p_collection)
  ),'[]'::jsonb)) from public.bopli_revision r where singleton;
$$;

create function public.bopli_commit(p_revision bigint,p_writes jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare current_revision bigint; item jsonb; target text;
begin
  -- A single row lock serializes commits, including concurrent group creation,
  -- invites and repayment confirmations. Compare ALL observed data to the epoch.
  select revision into current_revision from public.bopli_revision where singleton for update;
  if current_revision<>p_revision then return '{"conflict":true}'::jsonb; end if;
  if jsonb_typeof(p_writes)<>'array' or jsonb_array_length(p_writes)>450 then
    raise exception 'Invalid transaction';
  end if;
  for item in select value from jsonb_array_elements(p_writes) loop
    target := item->>'path';
    if target is null or jsonb_typeof(item->'data')<>'object' then raise exception 'Invalid row'; end if;
    if item->>'mode'='create' then
      insert into public.bopli_documents(path,collection_path,data) values(target,regexp_replace(target, '/[^/]+$', ''),item->'data');
    elsif item->>'mode'='set' then
      insert into public.bopli_documents(path,collection_path,data) values(target,regexp_replace(target, '/[^/]+$', ''),item->'data')
      on conflict(path) do update set data=excluded.data;
    elsif item->>'mode'='update' then
      update public.bopli_documents set data=data||(item->'data') where path=target;
      if not found then raise exception 'Missing row'; end if;
    else raise exception 'Invalid write mode'; end if;
  end loop;
  if jsonb_array_length(p_writes)>0 then
    update public.bopli_revision set revision=revision+1 where singleton;
  end if;
  return jsonb_build_object('conflict',false);
end;
$$;

-- PostgreSQL grants EXECUTE to PUBLIC by default: revoke it explicitly.
revoke all on function public.bopli_read(text,text),public.bopli_commit(bigint,jsonb) from public,anon,authenticated;
grant execute on function public.bopli_read(text,text),public.bopli_commit(bigint,jsonb) to service_role;

-- Realtime signals group epoch changes; RLS limits events to group members.
do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    alter publication supabase_realtime add table public.bopli_documents;
  end if;
end $$;

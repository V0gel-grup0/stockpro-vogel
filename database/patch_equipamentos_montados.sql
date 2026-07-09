create table if not exists public.mounted_equipments (
  id uuid primary key default gen_random_uuid(),
  equipment_name text not null unique,
  quantity numeric not null default 0,
  min_stock numeric not null default 0,
  notes text not null default '',
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table public.mounted_equipments enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
    and tablename = 'mounted_equipments'
    and policyname = 'mounted_equipments_all_authenticated'
  ) then
    create policy mounted_equipments_all_authenticated
    on public.mounted_equipments
    for all
    to authenticated
    using (true)
    with check (true);
  end if;
end $$;

alter table public.movements
add column if not exists item_name text not null default '';

alter table public.movements
add column if not exists item_type text not null default 'produto';

notify pgrst, 'reload schema';
select pg_notify('pgrst', 'reload schema');

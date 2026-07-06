-- Rode no Supabase SQL Editor antes ou depois do deploy.

alter table public.clients
add column if not exists proposal_status text not null default 'Lead Frio';

alter table public.suppliers
add column if not exists proposal_status text not null default 'Lead Frio';

alter table public.orders
add column if not exists sale_code text;

create sequence if not exists public.sale_code_seq start 1;

create or replace function public.generate_sale_code()
returns trigger as $$
begin
  if new.sale_code is null or new.sale_code = '' then
    new.sale_code := 'VND-' || lpad(nextval('public.sale_code_seq')::text, 4, '0');
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_generate_sale_code on public.orders;

create trigger trg_generate_sale_code
before insert on public.orders
for each row
execute function public.generate_sale_code();

notify pgrst, 'reload schema';
select pg_notify('pgrst', 'reload schema');

-- IVA configurable por organización. Ejecutar una vez en Supabase SQL Editor.
alter table public.organizations
  add column if not exists tax_rate numeric(5,2) not null default 16;

alter table public.organizations
  drop constraint if exists organizations_tax_rate_check;

alter table public.organizations
  add constraint organizations_tax_rate_check check (tax_rate between 0 and 100);

create or replace function public.update_org_tax_rate(p_tax_rate numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_role(array['admin']::employee_role[]) then
    raise exception 'Solo un administrador puede configurar el IVA.';
  end if;

  if p_tax_rate is null or p_tax_rate < 0 or p_tax_rate > 100 then
    raise exception 'El IVA debe estar entre 0 y 100.';
  end if;

  update public.organizations
  set tax_rate = round(p_tax_rate, 2)
  where id = public.current_org();

  if not found then
    raise exception 'No se encontró la organización.';
  end if;
end;
$$;

revoke all on function public.update_org_tax_rate(numeric) from public;
grant execute on function public.update_org_tax_rate(numeric) to authenticated;
-- Parche: sistema de planes (free / trial / pro).
-- Correr una vez en el SQL Editor de Supabase.

-- Toda organización nueva arranca con 14 días de prueba Pro
alter table organizations
  add column if not exists trial_ends_at timestamptz
  not null default (now() + interval '14 days');

alter table organizations
  add constraint organizations_plan_check
  check (plan in ('free', 'trial', 'pro'));

-- Plan efectivo de la organización del usuario actual:
-- 'pro' si paga o si su trial sigue vivo; 'free' en cualquier otro caso.
create or replace function effective_plan()
returns text
language sql stable security definer
set search_path = public
as $$
  select case
    when o.plan = 'pro' then 'pro'
    when o.plan = 'trial' and o.trial_ends_at > now() then 'pro'
    else 'free'
  end
  from organizations o
  where o.id = current_org()
$$;

-- Candado de servidor: los reportes por rango son función Pro.
-- (Los de "hoy" siguen libres para todos los planes.)
create or replace function report_sales_summary_range(p_from date, p_to date)
returns table (
  total_sales numeric, order_count bigint, avg_ticket numeric,
  local_count bigint, takeout_count bigint
)
language sql stable security definer set search_path = public as $$
  select
    coalesce(sum(o.total), 0), count(*),
    round(coalesce(avg(o.total), 0), 2),
    count(*) filter (where o.order_type = 'local'),
    count(*) filter (where o.order_type = 'llevar')
  from orders o
  where o.organization_id = current_org()
    and o.created_at::date between p_from and p_to
    and o.status <> 'cancelada'
    and o.branch_id = coalesce(current_branch(), o.branch_id)
    and has_role(array['supervisor','admin']::employee_role[])
    and effective_plan() = 'pro'
$$;

create or replace function report_sales_by_day(p_from date, p_to date)
returns table (day date, total numeric, order_count bigint)
language sql stable security definer set search_path = public as $$
  select o.created_at::date, sum(o.total), count(*)
  from orders o
  where o.organization_id = current_org()
    and o.created_at::date between p_from and p_to
    and o.status <> 'cancelada'
    and o.branch_id = coalesce(current_branch(), o.branch_id)
    and has_role(array['supervisor','admin']::employee_role[])
    and effective_plan() = 'pro'
  group by 1 order by 1
$$;

create or replace function report_top_products_range(
  p_from date, p_to date, p_limit int default 5
)
returns table (product_name text, units bigint, revenue numeric)
language sql stable security definer set search_path = public as $$
  select oi.product_name, sum(oi.quantity), sum(oi.quantity * oi.unit_price)
  from order_items oi
  join orders o on o.id = oi.order_id
  where o.organization_id = current_org()
    and o.created_at::date between p_from and p_to
    and o.status <> 'cancelada'
    and o.branch_id = coalesce(current_branch(), o.branch_id)
    and has_role(array['supervisor','admin']::employee_role[])
    and effective_plan() = 'pro'
  group by 1 order by 2 desc limit p_limit
$$;

create or replace function report_payments_breakdown_range(p_from date, p_to date)
returns table (method payment_method, card_type card_type, total numeric, tx_count bigint)
language sql stable security definer set search_path = public as $$
  select p.method, p.card_type, sum(p.amount), count(*)
  from payments p
  join orders o on o.id = p.order_id
  where p.organization_id = current_org()
    and p.created_at::date between p_from and p_to
    and o.status <> 'cancelada'
    and o.branch_id = coalesce(current_branch(), o.branch_id)
    and has_role(array['supervisor','admin']::employee_role[])
    and effective_plan() = 'pro'
  group by 1, 2 order by 3 desc
$$;

-- Para activar Pro a un cliente que ya pagó (manual, por ahora):
-- update organizations set plan = 'pro' where slug = 'su-slug';
-- Para regresarlo a gratis:
-- update organizations set plan = 'free' where slug = 'su-slug';

-- Parche: reportes por rango (semana, mes, año).
-- Correr una vez en el SQL Editor de Supabase.

create or replace function report_sales_summary_range(p_from date, p_to date)
returns table (
  total_sales numeric, order_count bigint, avg_ticket numeric,
  local_count bigint, takeout_count bigint
)
language sql stable security definer set search_path = public as $$
  select
    coalesce(sum(o.total), 0),
    count(*),
    round(coalesce(avg(o.total), 0), 2),
    count(*) filter (where o.order_type = 'local'),
    count(*) filter (where o.order_type = 'llevar')
  from orders o
  where o.organization_id = current_org()
    and o.created_at::date between p_from and p_to
    and o.status <> 'cancelada'
    and o.branch_id = coalesce(current_branch(), o.branch_id)
    and has_role(array['supervisor','admin']::employee_role[])
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
  group by 1, 2 order by 3 desc
$$;

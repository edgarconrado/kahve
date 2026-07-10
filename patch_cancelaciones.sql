-- Parche: excluir órdenes canceladas del desglose de pagos.
-- Correr una vez en el SQL Editor de Supabase.
create or replace function report_payments_breakdown(
  p_date date default current_date,
  p_branch_id uuid default null
)
returns table (method payment_method, card_type card_type, total numeric, tx_count bigint)
language sql stable security definer
set search_path = public
as $$
  select p.method, p.card_type, sum(p.amount), count(*)
  from payments p
  join orders o on o.id = p.order_id
  where p.organization_id = current_org()
    and p.created_at::date = p_date
    and o.status <> 'cancelada'
    and o.branch_id = coalesce(p_branch_id, current_branch(), o.branch_id)
    and has_role(array['supervisor','admin']::employee_role[])
  group by 1, 2
  order by 3 desc
$$;

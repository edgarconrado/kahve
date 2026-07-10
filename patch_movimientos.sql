-- Parche: movimientos de caja (retiros y depósitos durante el turno).
-- Correr una vez en el SQL Editor de Supabase.

create type cash_movement_type as enum ('retiro', 'deposito');

create table cash_movements (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  shift_id        uuid not null references shifts(id),
  employee_id     uuid not null references employees(id),
  type            cash_movement_type not null,
  amount          numeric(10,2) not null check (amount > 0),
  reason          text not null,               -- 'Pago al proveedor del pan'
  created_at      timestamptz not null default now()
);

create index idx_cash_movements_shift on cash_movements(shift_id);

alter table cash_movements enable row level security;

create policy cash_movements_select on cash_movements for select
  using (exists (
    select 1 from shifts s
    where s.id = cash_movements.shift_id
      and can_access_branch(s.branch_id)
  ));

create policy cash_movements_insert on cash_movements for insert
  with check (
    has_role(array['cajero','supervisor','admin']::employee_role[])
    and organization_id = current_org()
    and exists (
      select 1 from shifts s
      where s.id = cash_movements.shift_id
        and s.status = 'abierto'
        and can_access_branch(s.branch_id)
    )
  );
-- Sin update/delete: los movimientos son inmutables para auditoría.
-- Un error se corrige con un movimiento contrario.

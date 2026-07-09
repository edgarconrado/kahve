-- ============================================================
-- Kahve - Punto de venta para cafeterías (multi-tenant SaaS)
-- Esquema de base de datos para Supabase
--
-- Jerarquía: organizations (clientes) -> branches -> employees
-- Aislamiento entre clientes garantizado por RLS.
-- Roles: admin (dueño de la organización), supervisor, cajero, barista
-- Nota RLS: todas las políticas usan (select auth.uid()) para
-- evitar el warning auth_rls_initplan del linter de Supabase.
-- ============================================================

-- ------------------------------------------------------------
-- 1. ENUMS
-- ------------------------------------------------------------
create type employee_role as enum ('admin', 'supervisor', 'cajero', 'barista');

create type order_status as enum (
  'abierta',        -- en captura, aún no cobrada
  'pagada',         -- cobrada, esperando preparación
  'en_preparacion', -- barista la tomó
  'lista',          -- lista para entregar
  'entregada',
  'cancelada'
);

create type order_type as enum ('local', 'llevar');

create type payment_method as enum ('efectivo', 'tarjeta', 'transferencia');

create type card_type as enum ('debito', 'credito');

create type shift_status as enum ('abierto', 'cerrado');

-- ------------------------------------------------------------
-- 2. TABLAS
-- ------------------------------------------------------------

-- Cada cliente del SaaS es una organización (tenant)
create table organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,             -- 'Café Central', 'La Borra'
  slug        text unique not null,      -- 'cafe-central' (para URLs/soporte)
  is_active   boolean not null default true,
  plan        text not null default 'trial',  -- trial | basico | pro (futuro billing)
  created_at  timestamptz not null default now()
);

create table branches (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  name            text not null,
  address         text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

create table employees (
  id              uuid primary key default gen_random_uuid(),
  auth_user_id    uuid unique references auth.users(id) on delete set null,
  organization_id uuid not null references organizations(id),
  -- branch_id null = acceso a todas las sucursales de su organización
  -- (típico del admin/dueño). El personal operativo siempre tiene sucursal.
  branch_id       uuid references branches(id),
  full_name       text not null,
  email           text unique,
  role            employee_role not null default 'barista',
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint operational_staff_needs_branch check (
    role = 'admin' or branch_id is not null
  )
);

create table product_categories (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  branch_id       uuid not null references branches(id),
  name            text not null,
  sort_order      int not null default 0,
  is_active       boolean not null default true
);

create table products (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  branch_id       uuid not null references branches(id),
  category_id     uuid not null references product_categories(id),
  name            text not null,
  description     text,
  base_price      numeric(10,2) not null check (base_price >= 0),
  is_available    boolean not null default true,  -- switch "agotado"
  is_active       boolean not null default true,  -- borrado lógico
  sort_order      int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table modifiers (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references products(id) on delete cascade,
  name        text not null,                    -- 'Tamaño grande', 'Leche de avena'
  price_delta numeric(10,2) not null default 0, -- +10, +8, 0
  is_active   boolean not null default true
);

create table shifts (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations(id),
  branch_id         uuid not null references branches(id),
  employee_id       uuid not null references employees(id),  -- quien abre la caja
  status            shift_status not null default 'abierto',
  opening_cash      numeric(10,2) not null default 0,        -- fondo de caja
  expected_cash     numeric(10,2),                           -- calculado al cierre
  counted_cash      numeric(10,2),                           -- lo contado físicamente
  cash_difference   numeric(10,2),                           -- counted - expected
  denominations     jsonb,      -- {"500": 2, "200": 4, "100": 7, "coins": 118.50}
  approved_by       uuid references employees(id),           -- supervisor si hay diferencia
  opened_at         timestamptz not null default now(),
  closed_at         timestamptz
);

create table orders (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  branch_id       uuid not null references branches(id),
  shift_id        uuid not null references shifts(id),
  order_number    int not null,                     -- consecutivo por sucursal/día (#048)
  customer_name   text,
  order_type      order_type not null default 'llevar',
  status          order_status not null default 'abierta',
  subtotal        numeric(10,2) not null default 0,
  tax             numeric(10,2) not null default 0, -- IVA 16%
  discount        numeric(10,2) not null default 0,
  total           numeric(10,2) not null default 0,
  created_by      uuid not null references employees(id),  -- cajero
  prepared_by     uuid references employees(id),           -- barista
  cancelled_by    uuid references employees(id),
  cancel_reason   text,
  created_at      timestamptz not null default now(),
  paid_at         timestamptz,
  ready_at        timestamptz,
  delivered_at    timestamptz
);

create table order_items (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references orders(id) on delete cascade,
  product_id   uuid not null references products(id),
  product_name text not null,          -- snapshot del nombre al momento de la venta
  unit_price   numeric(10,2) not null, -- snapshot del precio base
  quantity     int not null check (quantity > 0),
  notes        text                    -- 'sin azúcar', 'calentada'
);

create table order_item_modifiers (
  id            uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references order_items(id) on delete cascade,
  modifier_name text not null,          -- snapshot
  price_delta   numeric(10,2) not null  -- snapshot
);

create table payments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  order_id        uuid not null references orders(id),
  shift_id        uuid not null references shifts(id),
  method          payment_method not null,
  card_type       card_type,                -- solo cuando method = 'tarjeta'
  amount          numeric(10,2) not null check (amount > 0),
  received        numeric(10,2),            -- efectivo recibido
  change_due      numeric(10,2),            -- cambio entregado
  reference       text,                     -- últimos 4 dígitos o folio del voucher
  created_by      uuid not null references employees(id),
  created_at      timestamptz not null default now(),
  constraint card_type_required check (
    (method = 'tarjeta' and card_type is not null)
    or (method <> 'tarjeta' and card_type is null)
  )
);

-- ------------------------------------------------------------
-- 3. ÍNDICES
--    organization_id primero: casi toda query filtra por tenant
-- ------------------------------------------------------------
create index idx_branches_org        on branches(organization_id);
create index idx_employees_org       on employees(organization_id, branch_id);
create index idx_products_org        on products(organization_id, branch_id, category_id);
create index idx_orders_org_date     on orders(organization_id, branch_id, created_at desc);
create index idx_orders_queue        on orders(branch_id, status)
  where status in ('pagada', 'en_preparacion');  -- índice parcial para la cola
create index idx_payments_shift      on payments(shift_id);
create index idx_shifts_org          on shifts(organization_id, branch_id, opened_at desc);

-- ------------------------------------------------------------
-- 4. TRIGGERS
-- ------------------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger trg_employees_updated before update on employees
  for each row execute function set_updated_at();
create trigger trg_products_updated before update on products
  for each row execute function set_updated_at();

-- Consecutivo de orden por sucursal y día
create or replace function next_order_number()
returns trigger language plpgsql as $$
begin
  select coalesce(max(order_number), 0) + 1 into new.order_number
  from orders
  where branch_id = new.branch_id
    and created_at::date = now()::date;
  return new;
end $$;

create trigger trg_order_number before insert on orders
  for each row execute function next_order_number();

-- ------------------------------------------------------------
-- 5. FUNCIONES HELPER PARA RLS (security definer)
--    Patrón: (select auth.uid()) para evitar auth_rls_initplan
-- ------------------------------------------------------------
create or replace function current_employee_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select id from employees
  where auth_user_id = (select auth.uid()) and is_active
$$;

create or replace function current_employee_role()
returns employee_role
language sql stable security definer
set search_path = public
as $$
  select role from employees
  where auth_user_id = (select auth.uid()) and is_active
$$;

create or replace function current_org()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select organization_id from employees
  where auth_user_id = (select auth.uid()) and is_active
$$;

-- Sucursal asignada del empleado (null = admin con acceso a toda la org)
create or replace function current_branch()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select branch_id from employees
  where auth_user_id = (select auth.uid()) and is_active
$$;

create or replace function has_role(roles employee_role[])
returns boolean
language sql stable security definer
set search_path = public
as $$
  select current_employee_role() = any(roles)
$$;

-- ¿El empleado puede operar sobre esta sucursal?
-- Debe ser de su organización Y, si tiene sucursal asignada, coincidir.
create or replace function can_access_branch(p_branch_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from branches b
    where b.id = p_branch_id
      and b.organization_id = current_org()
      and (current_branch() is null or current_branch() = p_branch_id)
  )
$$;

-- ------------------------------------------------------------
-- 6. ROW LEVEL SECURITY
--    Regla de oro multi-tenant: NINGUNA política permite ver
--    datos fuera de current_org().
-- ------------------------------------------------------------
alter table organizations       enable row level security;
alter table branches            enable row level security;
alter table employees           enable row level security;
alter table product_categories  enable row level security;
alter table products            enable row level security;
alter table modifiers           enable row level security;
alter table shifts              enable row level security;
alter table orders              enable row level security;
alter table order_items         enable row level security;
alter table order_item_modifiers enable row level security;
alter table payments            enable row level security;

-- Organizations: cada quien ve solo la suya; nadie la modifica desde el cliente
-- (altas de organización via Edge Function con service_role en el onboarding)
create policy org_select on organizations for select
  using (id = current_org());

-- Branches: se ven las de la org; solo admin crea/edita
create policy branches_select on branches for select
  using (organization_id = current_org());
create policy branches_admin on branches for all
  using (has_role(array['admin']::employee_role[])
         and organization_id = current_org())
  with check (organization_id = current_org());

-- Employees: cada quien se ve a sí mismo; admin gestiona a todos en su org
create policy employees_select_self on employees for select
  using (auth_user_id = (select auth.uid()));
create policy employees_admin_select on employees for select
  using (has_role(array['admin']::employee_role[])
         and organization_id = current_org());
create policy employees_admin_write on employees for all
  using (has_role(array['admin']::employee_role[])
         and organization_id = current_org())
  with check (organization_id = current_org());

-- Menú: se lee lo de la sucursal accesible; solo admin edita
create policy categories_select on product_categories for select
  using (can_access_branch(branch_id));
create policy categories_admin on product_categories for all
  using (has_role(array['admin']::employee_role[])
         and organization_id = current_org())
  with check (organization_id = current_org());

create policy products_select on products for select
  using (can_access_branch(branch_id));
create policy products_admin on products for all
  using (has_role(array['admin']::employee_role[])
         and organization_id = current_org())
  with check (organization_id = current_org());

create policy modifiers_select on modifiers for select
  using (exists (
    select 1 from products p
    where p.id = modifiers.product_id
      and can_access_branch(p.branch_id)
  ));
create policy modifiers_admin on modifiers for all
  using (exists (
    select 1 from products p
    where p.id = modifiers.product_id
      and p.organization_id = current_org()
  ) and has_role(array['admin']::employee_role[]));

-- Shifts: cajero/supervisor/admin abren y cierran en sucursal accesible
create policy shifts_select on shifts for select
  using (can_access_branch(branch_id));
create policy shifts_insert on shifts for insert
  with check (has_role(array['cajero','supervisor','admin']::employee_role[])
              and can_access_branch(branch_id)
              and organization_id = current_org());
create policy shifts_update on shifts for update
  using (has_role(array['cajero','supervisor','admin']::employee_role[])
         and can_access_branch(branch_id));

-- Orders: todos leen su sucursal (el barista necesita la cola);
-- cajero/supervisor/admin crean; barista solo avanza la preparación
create policy orders_select on orders for select
  using (can_access_branch(branch_id));
create policy orders_insert on orders for insert
  with check (has_role(array['cajero','supervisor','admin']::employee_role[])
              and can_access_branch(branch_id)
              and organization_id = current_org());
create policy orders_update_cashier on orders for update
  using (has_role(array['cajero','supervisor','admin']::employee_role[])
         and can_access_branch(branch_id));
create policy orders_update_barista on orders for update
  using (has_role(array['barista']::employee_role[])
         and can_access_branch(branch_id)
         and status in ('pagada','en_preparacion'));
-- Nota: la cancelación de órdenes cobradas se valida en la RPC cancel_order,
-- que exige rol supervisor/admin.

-- Order items y modificadores: siguen a la orden
create policy order_items_select on order_items for select
  using (exists (
    select 1 from orders o
    where o.id = order_items.order_id
      and can_access_branch(o.branch_id)
  ));
create policy order_items_write on order_items for all
  using (exists (
    select 1 from orders o
    where o.id = order_items.order_id
      and o.organization_id = current_org()
  ) and has_role(array['cajero','supervisor','admin']::employee_role[]));

create policy oim_select on order_item_modifiers for select
  using (exists (
    select 1 from order_items oi
    join orders o on o.id = oi.order_id
    where oi.id = order_item_modifiers.order_item_id
      and can_access_branch(o.branch_id)
  ));
create policy oim_write on order_item_modifiers for all
  using (exists (
    select 1 from order_items oi
    join orders o on o.id = oi.order_id
    where oi.id = order_item_modifiers.order_item_id
      and o.organization_id = current_org()
  ) and has_role(array['cajero','supervisor','admin']::employee_role[]));

-- Payments
create policy payments_select on payments for select
  using (exists (
    select 1 from shifts s
    where s.id = payments.shift_id
      and can_access_branch(s.branch_id)
  ));
create policy payments_insert on payments for insert
  with check (has_role(array['cajero','supervisor','admin']::employee_role[])
              and organization_id = current_org());

-- ------------------------------------------------------------
-- 7. FUNCIONES RPC PARA REPORTES (supervisor/admin)
--    p_branch_id null: el admin sin sucursal asignada ve toda la org;
--    el personal con sucursal ve la suya.
-- ------------------------------------------------------------
create or replace function report_sales_summary(
  p_date date default current_date,
  p_branch_id uuid default null
)
returns table (
  total_sales    numeric,
  order_count    bigint,
  avg_ticket     numeric,
  local_count    bigint,
  takeout_count  bigint
)
language sql stable security definer
set search_path = public
as $$
  select
    coalesce(sum(o.total), 0),
    count(*),
    round(coalesce(avg(o.total), 0), 2),
    count(*) filter (where o.order_type = 'local'),
    count(*) filter (where o.order_type = 'llevar')
  from orders o
  where o.organization_id = current_org()
    and o.created_at::date = p_date
    and o.status <> 'cancelada'
    and o.branch_id = coalesce(p_branch_id, current_branch(), o.branch_id)
    and has_role(array['supervisor','admin']::employee_role[])
$$;

create or replace function report_sales_by_hour(
  p_date date default current_date,
  p_branch_id uuid default null
)
returns table (hour_of_day int, total numeric, order_count bigint)
language sql stable security definer
set search_path = public
as $$
  select
    extract(hour from o.created_at)::int,
    sum(o.total),
    count(*)
  from orders o
  where o.organization_id = current_org()
    and o.created_at::date = p_date
    and o.status <> 'cancelada'
    and o.branch_id = coalesce(p_branch_id, current_branch(), o.branch_id)
    and has_role(array['supervisor','admin']::employee_role[])
  group by 1
  order by 1
$$;

create or replace function report_top_products(
  p_date date default current_date,
  p_limit int default 5,
  p_branch_id uuid default null
)
returns table (product_name text, units bigint, revenue numeric)
language sql stable security definer
set search_path = public
as $$
  select
    oi.product_name,
    sum(oi.quantity),
    sum(oi.quantity * oi.unit_price)
  from order_items oi
  join orders o on o.id = oi.order_id
  where o.organization_id = current_org()
    and o.created_at::date = p_date
    and o.status <> 'cancelada'
    and o.branch_id = coalesce(p_branch_id, current_branch(), o.branch_id)
    and has_role(array['supervisor','admin']::employee_role[])
  group by 1
  order by 2 desc
  limit p_limit
$$;

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
    and o.branch_id = coalesce(p_branch_id, current_branch(), o.branch_id)
    and has_role(array['supervisor','admin']::employee_role[])
  group by 1, 2
  order by 3 desc
$$;

-- ------------------------------------------------------------
-- 8. RPC: cancelar orden cobrada (solo supervisor/admin)
-- ------------------------------------------------------------
create or replace function cancel_order(p_order_id uuid, p_reason text)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not has_role(array['supervisor','admin']::employee_role[]) then
    raise exception 'Se requiere rol de supervisor o admin para cancelar órdenes cobradas';
  end if;

  update orders o
  set status = 'cancelada',
      cancelled_by = current_employee_id(),
      cancel_reason = p_reason
  where o.id = p_order_id
    and o.organization_id = current_org()
    and can_access_branch(o.branch_id);
end $$;

-- ------------------------------------------------------------
-- 9. ONBOARDING: alta de un nuevo cliente del SaaS
--    Llamar desde una Edge Function con service_role, después de
--    crear el usuario de auth del dueño (auth.admin.createUser).
-- ------------------------------------------------------------
create or replace function onboard_organization(
  p_org_name     text,
  p_org_slug     text,
  p_branch_name  text,
  p_owner_auth_id uuid,
  p_owner_name   text,
  p_owner_email  text
)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_branch_id uuid;
begin
  insert into organizations (name, slug)
  values (p_org_name, p_org_slug)
  returning id into v_org_id;

  insert into branches (organization_id, name)
  values (v_org_id, p_branch_name)
  returning id into v_branch_id;

  -- El dueño queda como admin sin sucursal asignada: ve toda su org
  insert into employees (auth_user_id, organization_id, branch_id, full_name, email, role)
  values (p_owner_auth_id, v_org_id, null, p_owner_name, p_owner_email, 'admin');

  return v_org_id;
end $$;

-- Solo el service_role puede ejecutar el onboarding
revoke execute on function onboard_organization from public, anon, authenticated;

-- ------------------------------------------------------------
-- 10. REALTIME: cola de preparación
-- ------------------------------------------------------------
-- En el dashboard de Supabase habilita Realtime para la tabla orders,
-- o vía SQL:
alter publication supabase_realtime add table orders;

-- En el cliente (React Native), el barista se suscribe filtrando por
-- SU sucursal (Realtime respeta RLS con la opción de "private channels",
-- pero el filtro explícito reduce tráfico):
-- supabase.channel('kahve-queue')
--   .on('postgres_changes',
--     { event: '*', schema: 'public', table: 'orders',
--       filter: `branch_id=eq.${branchId}` },
--     handleChange)
--   .subscribe()

-- Parche: propinas en pagos.
-- Correr una vez en el SQL Editor de Supabase.
alter table payments
  add column if not exists tip numeric(10,2) not null default 0 check (tip >= 0);

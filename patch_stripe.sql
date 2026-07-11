-- Parche: integración con Stripe.
-- Correr una vez en el SQL Editor de Supabase.
alter table organizations
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text;

create index if not exists idx_orgs_stripe_sub
  on organizations(stripe_subscription_id);

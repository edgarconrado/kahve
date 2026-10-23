-- Retira las columnas heredadas de Stripe después de migrar a RevenueCat.
-- Ejecutar una vez en el SQL Editor de Supabase.

drop index if exists idx_orgs_stripe_sub;

alter table organizations
  drop column if exists stripe_customer_id,
  drop column if exists stripe_subscription_id;
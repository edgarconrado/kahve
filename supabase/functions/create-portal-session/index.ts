// Edge Function: create-portal-session
// Genera un link temporal al Customer Portal de Stripe para que el ADMIN
// de una organización administre su propia suscripción: cambiar tarjeta,
// descargar facturas, o cancelar — sin intervención manual tuya.
// Requiere auth (el usuario debe tener sesión); valida que sea admin.
// Desplegar con: npx supabase functions deploy create-portal-session

import Stripe from 'npm:stripe@17';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!);

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  // Verificar sesión del usuario (llave anon + JWT del header, respeta RLS)
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'No autenticado' }, 401);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: 'Sesión inválida' }, 401);

  const { data: employee } = await supabase
    .from('employees')
    .select('organization_id, role, is_active')
    .eq('auth_user_id', user.id)
    .single();

  if (!employee?.is_active || employee.role !== 'admin') {
    return json({ error: 'Solo el administrador puede gestionar la suscripción' }, 403);
  }

  const { data: org } = await supabase
    .from('organizations')
    .select('stripe_customer_id')
    .eq('id', employee.organization_id)
    .single();

  if (!org?.stripe_customer_id) {
    return json({
      error: 'Esta cafetería aún no tiene una suscripción de Stripe activa.',
    }, 404);
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: org.stripe_customer_id,
    return_url: 'https://jacarandalab.com/kahve', // pantalla a la que regresa; ajusta si quieres
    locale: 'es-419', // español latinoamericano
  });

  return json({ url: session.url });
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

import { createClient } from 'jsr:@supabase/supabase-js@2';

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const authorization = req.headers.get('Authorization') ?? '';
  let organizationId: string | null = null;

  if (authorization === Deno.env.get('REVENUECAT_WEBHOOK_AUTH')) {
    const payload = await req.json();
    if (payload?.event?.type === 'TEST') {
      return json({ received: true, test: true });
    }
    organizationId = payload?.event?.app_user_id ?? payload?.event?.transferred_to?.[0] ?? null;
  } else {
    const caller = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authorization } } },
    );
    const { data: userData } = await caller.auth.getUser();
    if (!userData.user) return json({ error: 'No autenticado' }, 401);

    const { data: employee } = await admin
      .from('employees')
      .select('organization_id, role, is_active')
      .eq('auth_user_id', userData.user.id)
      .single();
    if (!employee?.is_active || employee.role !== 'admin') {
      return json({ error: 'Se requiere rol de admin' }, 403);
    }
    organizationId = employee.organization_id;
  }

  if (!organizationId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(organizationId)) {
    return json({ error: 'App User ID inválido' }, 400);
  }

  const response = await fetch(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(organizationId)}`,
    { headers: { Authorization: `Bearer ${Deno.env.get('REVENUECAT_SECRET_API_KEY')!}` } },
  );
  if (!response.ok) {
    console.error('RevenueCat respondió', response.status, await response.text());
    return json({ error: 'No se pudo consultar la suscripción' }, 502);
  }

  const subscriber = (await response.json()).subscriber;
  const entitlement = subscriber?.entitlements?.pro;
  const expiresAt = entitlement?.expires_date ? new Date(entitlement.expires_date) : null;
  const isPro = Boolean(entitlement && (!expiresAt || expiresAt > new Date()));

  const { error } = await admin
    .from('organizations')
    .update({ plan: isPro ? 'pro' : 'free' })
    .eq('id', organizationId);
  if (error) return json({ error: error.message }, 500);

  return json({ plan: isPro ? 'pro' : 'free' });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
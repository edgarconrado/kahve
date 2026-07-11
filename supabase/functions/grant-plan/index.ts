// Edge Function: grant-plan
// Herramienta de ADMINISTRACIÓN DE LA PLATAFORMA (solo para ti, Edgar):
// regalar Pro temporal, activar Pro permanente o regresar a gratis.
// Protegida con el mismo secreto que onboard (ONBOARDING_SECRET).
// Desplegar con: npx supabase functions deploy grant-plan --no-verify-jwt
//
// Ejemplos:
//  Regalar 90 días de Pro (caduca solo):
//    { "slug": "cafe-la-borra", "plan": "trial", "days": 90 }
//  Pro permanente (cliente que pagó):
//    { "slug": "cafe-la-borra", "plan": "pro" }
//  Regresar a gratis:
//    { "slug": "cafe-la-borra", "plan": "free" }

import { createClient } from 'jsr:@supabase/supabase-js@2';

interface GrantRequest {
  slug: string;
  plan: 'free' | 'trial' | 'pro';
  days?: number; // solo aplica con plan 'trial'
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const secret = req.headers.get('x-onboarding-secret');
  if (!secret || secret !== Deno.env.get('ONBOARDING_SECRET')) {
    return json({ error: 'No autorizado' }, 401);
  }

  let body: GrantRequest;
  try { body = await req.json(); } catch { return json({ error: 'Body inválido' }, 400); }

  if (!body.slug?.trim()) return json({ error: 'Falta el slug' }, 400);
  if (!['free', 'trial', 'pro'].includes(body.plan)) {
    return json({ error: "plan debe ser 'free', 'trial' o 'pro'" }, 400);
  }
  if (body.plan === 'trial' && (!body.days || body.days <= 0 || body.days > 730)) {
    return json({ error: "Con plan 'trial' indica days entre 1 y 730" }, 400);
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const update: Record<string, unknown> = { plan: body.plan };
  if (body.plan === 'trial') {
    update.trial_ends_at =
      new Date(Date.now() + body.days! * 86_400_000).toISOString();
  }

  const { data: org, error } = await admin
    .from('organizations')
    .update(update)
    .eq('slug', body.slug.trim())
    .select('name, slug, plan, trial_ends_at')
    .single();

  if (error || !org) {
    return json({ error: `No se encontró la organización '${body.slug}'` }, 404);
  }

  return json({
    ok: true,
    organization: org.name,
    slug: org.slug,
    plan: org.plan,
    ...(org.plan === 'trial' ? { pro_until: org.trial_ends_at } : {}),
  });
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

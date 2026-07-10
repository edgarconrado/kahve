// Edge Function: signup
// Registro AUTOSERVICIO de cafeterías nuevas (plan trial).
// A diferencia de 'onboard' (con secreto, para ventas manuales),
// esta función es pública: cualquiera puede crear su organización.
// Desplegar con: npx supabase functions deploy signup --no-verify-jwt
//
// ANTES DE LANZAR A PRODUCCIÓN considera agregar: verificación de
// correo, captcha, y rate limiting, para frenar registros basura.

import { createClient } from 'jsr:@supabase/supabase-js@2';

interface SignupRequest {
  orgName: string;     // 'Café La Borra'
  branchName?: string; // default 'Principal'
  ownerName: string;
  email: string;
  pin: string;         // 6 dígitos
}

// 'Café La Borra' -> 'cafe-la-borra'
function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quitar acentos
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  let body: SignupRequest;
  try { body = await req.json(); } catch { return json({ error: 'Body inválido' }, 400); }

  if (!body.orgName?.trim() || !body.ownerName?.trim() || !body.email?.trim()) {
    return json({ error: 'Faltan campos: orgName, ownerName o email' }, 400);
  }
  if (!/^\d{6}$/.test(body.pin)) {
    return json({ error: 'El PIN debe ser de 6 dígitos' }, 400);
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Slug único: base + sufijo aleatorio si ya existe
  const base = slugify(body.orgName) || 'cafeteria';
  let slug = base;
  const { data: existing } = await admin
    .from('organizations').select('id').eq('slug', slug).maybeSingle();
  if (existing) slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;

  // Usuario de auth del dueño
  const { data: userData, error: userError } = await admin.auth.admin.createUser({
    email: body.email.trim().toLowerCase(),
    password: body.pin,
    email_confirm: true,
  });
  if (userError || !userData.user) {
    const friendly = userError?.message?.includes('already')
      ? 'Ese correo ya tiene una cuenta. Inicia sesión o usa otro correo.'
      : `No se pudo crear la cuenta: ${userError?.message}`;
    return json({ error: friendly }, 422);
  }

  // Organización + sucursal + admin (transacción)
  const { data: orgId, error: orgError } = await admin.rpc('onboard_organization', {
    p_org_name: body.orgName.trim(),
    p_org_slug: slug,
    p_branch_name: body.branchName?.trim() || 'Principal',
    p_owner_auth_id: userData.user.id,
    p_owner_name: body.ownerName.trim(),
    p_owner_email: body.email.trim().toLowerCase(),
  });

  if (orgError) {
    await admin.auth.admin.deleteUser(userData.user.id); // rollback
    return json({ error: `No se pudo crear la organización: ${orgError.message}` }, 422);
  }

  return json({ ok: true, organizationId: orgId, slug });
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

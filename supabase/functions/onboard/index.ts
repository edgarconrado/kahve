// Edge Function: onboard
// Da de alta un cliente nuevo de Kahve: crea el usuario de auth del
// dueño (service_role) y llama a onboard_organization() en la BD.
//
// Protegida con un secreto propio (ONBOARDING_SECRET): solo tú o tu
// futuro panel de ventas pueden llamarla, nunca la app de los clientes.

import { createClient } from 'jsr:@supabase/supabase-js@2';

interface OnboardRequest {
  orgName: string;      // 'Café La Borra'
  orgSlug: string;      // 'la-borra'
  branchName: string;   // 'Sucursal Centro'
  ownerName: string;    // 'Juan Pérez'
  ownerEmail: string;
  ownerPin: string;     // 6 dígitos: será su contraseña de Supabase
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return json({ error: 'Método no permitido' }, 405);
  }

  // Autorización: secreto compartido, independiente de las llaves de Supabase
  const secret = req.headers.get('x-onboarding-secret');
  if (!secret || secret !== Deno.env.get('ONBOARDING_SECRET')) {
    return json({ error: 'No autorizado' }, 401);
  }

  let body: OnboardRequest;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Body inválido' }, 400);
  }

  const missing = (
    ['orgName', 'orgSlug', 'branchName', 'ownerName', 'ownerEmail', 'ownerPin'] as const
  ).filter((k) => !body[k]?.trim());
  if (missing.length > 0) {
    return json({ error: `Faltan campos: ${missing.join(', ')}` }, 400);
  }
  if (!/^\d{6}$/.test(body.ownerPin)) {
    return json({ error: 'El PIN debe ser de 6 dígitos' }, 400);
  }
  if (!/^[a-z0-9-]+$/.test(body.orgSlug)) {
    return json({ error: 'El slug solo admite minúsculas, números y guiones' }, 400);
  }

  // Cliente con service_role: puede crear usuarios y ejecutar el onboarding
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // 1. Usuario de auth del dueño, confirmado (sin verificación de correo)
  const { data: userData, error: userError } = await admin.auth.admin.createUser({
    email: body.ownerEmail.trim().toLowerCase(),
    password: body.ownerPin,
    email_confirm: true,
  });
  if (userError || !userData.user) {
    return json({ error: `No se pudo crear el usuario: ${userError?.message}` }, 422);
  }

  // 2. Organización + sucursal + empleado admin, en una transacción
  const { data: orgId, error: orgError } = await admin.rpc('onboard_organization', {
    p_org_name: body.orgName.trim(),
    p_org_slug: body.orgSlug.trim(),
    p_branch_name: body.branchName.trim(),
    p_owner_auth_id: userData.user.id,
    p_owner_name: body.ownerName.trim(),
    p_owner_email: body.ownerEmail.trim().toLowerCase(),
  });

  if (orgError) {
    // Rollback manual del usuario para no dejar auth huérfano
    // (p. ej. si el slug ya existía)
    await admin.auth.admin.deleteUser(userData.user.id);
    return json({ error: `No se pudo crear la organización: ${orgError.message}` }, 422);
  }

  return json({
    ok: true,
    organizationId: orgId,
    ownerAuthId: userData.user.id,
    message: `${body.orgName} dada de alta. El dueño ya puede entrar con su correo y PIN.`,
  });
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

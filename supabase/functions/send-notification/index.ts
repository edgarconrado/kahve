// Edge Function: send-notification
// Envía notificaciones push a tus usuarios, segmentado por plan.
// Protegida con el mismo secreto que grant-plan/onboard (ONBOARDING_SECRET).
// Desplegar con: npx supabase functions deploy send-notification --no-verify-jwt
//
// Ejemplos:
//
//  Avisar de una versión nueva a TODOS:
//   { "title": "Kahve se actualizó", "body": "Nueva versión disponible en la tienda.", "target": "all" }
//
//  Animar a los de plan gratis a contratar Pro (solo a administradores,
//  que son quienes pueden decidir contratar):
//   { "title": "Haz crecer tu cafetería", "body": "Prueba Kahve Pro: reportes, insumos y más.", "target": "free", "role": "admin" }

import { createClient } from 'jsr:@supabase/supabase-js@2';

interface NotifyRequest {
  title: string;
  body: string;
  target: 'all' | 'free' | 'pro'; // 'pro' incluye trial vigente
  role?: string; // opcional: solo enviar a un rol específico (ej. 'admin')
  data?: Record<string, unknown>; // opcional: payload extra (ej. para navegar a una pantalla)
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const secret = req.headers.get('x-onboarding-secret');
  if (!secret || secret !== Deno.env.get('ONBOARDING_SECRET')) {
    return json({ error: 'No autorizado' }, 401);
  }

  let payload: NotifyRequest;
  try { payload = await req.json(); } catch { return json({ error: 'Body inválido' }, 400); }

  if (!payload.title?.trim() || !payload.body?.trim()) {
    return json({ error: 'Faltan title o body' }, 400);
  }
  if (!['all', 'free', 'pro'].includes(payload.target)) {
    return json({ error: "target debe ser 'all', 'free' o 'pro'" }, 400);
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Determinar qué organizaciones califican, replicando la misma regla
  // que effective_plan(): 'pro' si plan='pro', o si plan='trial' y el
  // trial sigue vigente; 'free' en cualquier otro caso.
  let orgIds: string[] | null = null; // null = todas (target 'all')
  if (payload.target !== 'all') {
    const { data: orgs } = await admin
      .from('organizations')
      .select('id, plan, trial_ends_at');
    const now = new Date();
    const isPro = (o: any) =>
      o.plan === 'pro' || (o.plan === 'trial' && o.trial_ends_at && new Date(o.trial_ends_at) > now);
    orgIds = (orgs ?? [])
      .filter((o: any) => (payload.target === 'pro' ? isPro(o) : !isPro(o)))
      .map((o: any) => o.id);
    if (orgIds.length === 0) {
      return json({ ok: true, sent: 0, note: 'Ninguna organización coincide con el filtro.' });
    }
  }

  // Empleados activos que califican (opcionalmente filtrados por rol)
  let employeesQuery = admin.from('employees').select('id').eq('is_active', true);
  if (orgIds) employeesQuery = employeesQuery.in('organization_id', orgIds);
  if (payload.role) employeesQuery = employeesQuery.eq('role', payload.role);
  const { data: employees } = await employeesQuery;
  const employeeIds = (employees ?? []).map((e: any) => e.id);

  if (employeeIds.length === 0) {
    return json({ ok: true, sent: 0, note: 'Ningún empleado coincide con el filtro.' });
  }

  // Tokens de esos empleados
  const { data: tokenRows } = await admin
    .from('push_tokens')
    .select('token')
    .in('employee_id', employeeIds);
  const tokens = [...new Set((tokenRows ?? []).map((t: any) => t.token))];

  if (tokens.length === 0) {
    return json({ ok: true, sent: 0, note: 'Nadie en ese filtro tiene notificaciones activadas.' });
  }

  // El API de Expo Push acepta hasta 100 mensajes por lote
  const messages = tokens.map((to) => ({
    to, title: payload.title, body: payload.body, sound: 'default', data: payload.data ?? {},
  }));
  const chunks: typeof messages[] = [];
  for (let i = 0; i < messages.length; i += 100) chunks.push(messages.slice(i, i + 100));

  let sent = 0;
  const errors: string[] = [];
  for (const chunk of chunks) {
    try {
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(chunk),
      });
      if (!res.ok) { errors.push(`Lote falló: ${res.status}`); continue; }
      sent += chunk.length;
    } catch (e) {
      errors.push(String(e));
    }
  }

  return json({ ok: true, sent, totalTokens: tokens.length, errors: errors.length ? errors : undefined });
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

// Edge Function: create-employee
// Permite al ADMIN de una organización dar de alta a su personal.
// A diferencia de 'onboard', esta función la llama un usuario
// autenticado de la app: se verifica su JWT y que su rol sea admin.
// El empleado nuevo SIEMPRE se crea en la organización del admin
// que llama; es imposible crear personal en otra org.

import { createClient } from 'jsr:@supabase/supabase-js@2';

interface CreateEmployeeRequest {
  fullName: string;
  email: string;
  pin: string;                                  // 6 dígitos
  role: 'supervisor' | 'cajero' | 'barista';    // admin solo via onboarding
  branchId: string;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return json({ error: 'Método no permitido' }, 405);
  }

  // 1. Identificar al que llama con su propio JWT
  const authHeader = req.headers.get('Authorization') ?? '';
  const caller = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData, error: authError } = await caller.auth.getUser();
  if (authError || !userData.user) {
    return json({ error: 'No autenticado' }, 401);
  }

  // 2. Verificar que sea admin activo y obtener su organización
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const { data: adminEmployee } = await admin
    .from('employees')
    .select('id, organization_id, role, is_active')
    .eq('auth_user_id', userData.user.id)
    .single();

  if (!adminEmployee?.is_active || adminEmployee.role !== 'admin') {
    return json({ error: 'Se requiere rol de admin' }, 403);
  }

  // 3. Validar el body
  let body: CreateEmployeeRequest;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Body inválido' }, 400);
  }
  if (!body.fullName?.trim() || !body.email?.trim() || !body.branchId) {
    return json({ error: 'Faltan campos: fullName, email o branchId' }, 400);
  }
  if (!/^\d{6}$/.test(body.pin)) {
    return json({ error: 'El PIN debe ser de 6 dígitos' }, 400);
  }
  if (!['supervisor', 'cajero', 'barista'].includes(body.role)) {
    return json({ error: 'Rol inválido' }, 400);
  }

  // La sucursal debe pertenecer a la organización del admin
  const { data: branch } = await admin
    .from('branches')
    .select('id')
    .eq('id', body.branchId)
    .eq('organization_id', adminEmployee.organization_id)
    .single();
  if (!branch) {
    return json({ error: 'Sucursal inválida' }, 400);
  }

  // 4. Crear el usuario de auth del empleado
  const { data: newUser, error: userError } = await admin.auth.admin.createUser({
    email: body.email.trim().toLowerCase(),
    password: body.pin,
    email_confirm: true,
  });
  if (userError || !newUser.user) {
    return json({ error: `No se pudo crear el usuario: ${userError?.message}` }, 422);
  }

  // 5. Crear la fila de employees; rollback del auth user si falla
  const { data: employee, error: empError } = await admin
    .from('employees')
    .insert({
      auth_user_id: newUser.user.id,
      organization_id: adminEmployee.organization_id,
      branch_id: body.branchId,
      full_name: body.fullName.trim(),
      email: body.email.trim().toLowerCase(),
      role: body.role,
    })
    .select()
    .single();

  if (empError || !employee) {
    await admin.auth.admin.deleteUser(newUser.user.id);
    return json({ error: `No se pudo crear el empleado: ${empError?.message}` }, 422);
  }

  return json({ ok: true, employee });
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

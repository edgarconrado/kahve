// Edge Function: delete-account
// Requisito de Apple (Guideline 5.1.1v): toda app con creación de cuenta
// debe ofrecer eliminación de cuenta DENTRO de la app, no solo
// desactivación. Aquí "eliminar" significa: se borra por completo la
// cuenta de autenticación (nunca más puede iniciar sesión) y se
// anonimizan sus datos personales (nombre, correo). Los registros de
// ventas/turnos donde participó se CONSERVAN sin cambios — son
// necesarios por razones contables/fiscales del negocio, y ya no
// contienen ningún dato personal identificable del empleado.
//
// Requiere sesión (verifica el JWT del que llama; NO se despliega con
// --no-verify-jwt). Cada quien solo puede eliminar SU PROPIA cuenta.
// Desplegar con: npx supabase functions deploy delete-account

import { createClient } from 'jsr:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'No autenticado' }, 401);

  // Cliente con la sesión del usuario que llama, para saber quién es
  const asUser = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user } } = await asUser.auth.getUser();
  if (!user) return json({ error: 'Sesión inválida' }, 401);

  // Cliente con llave de servicio, para poder borrar el usuario de auth
  // y actualizar el registro del empleado saltándose RLS
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: employee } = await admin
    .from('employees')
    .select('id, role, organization_id')
    .eq('auth_user_id', user.id)
    .single();

  if (!employee) return json({ error: 'No se encontró la cuenta' }, 404);

  // Si es el único admin activo de su organización, avisamos en vez de
  // dejar la cafetería sin nadie que pueda administrarla. El empleado
  // puede seguir adelante si de verdad quiere (ver forceDelete), pero
  // por default lo prevenimos.
  let body: { forceDelete?: boolean } = {};
  try { body = await req.json(); } catch { /* body vacío es válido */ }

  if (employee.role === 'admin' && !body.forceDelete) {
    const { count } = await admin
      .from('employees')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', employee.organization_id)
      .eq('role', 'admin')
      .eq('is_active', true);
    if ((count ?? 0) <= 1) {
      return json({
        error: 'Eres el único administrador de tu cafetería. Si continúas, ' +
          'nadie más podrá gestionar el negocio en Kahve.',
        isSoleAdmin: true,
      }, 409);
    }
  }

  // 1) Borrar la cuenta de autenticación por completo — ya no podrá
  //    iniciar sesión nunca más, con ninguna contraseña.
  const { error: authError } = await admin.auth.admin.deleteUser(user.id);
  if (authError) return json({ error: `No se pudo eliminar la cuenta: ${authError.message}` }, 500);

  // 2) Anonimizar el registro del empleado. No se borra la fila (rompería
  //    el historial de ventas/turnos que hizo), solo se le quitan los
  //    datos personales y se desactiva.
  await admin.from('employees').update({
    full_name: 'Usuario eliminado',
    email: `deleted-${employee.id}@kahve.deleted`,
    is_active: false,
  }).eq('id', employee.id);

  return json({ ok: true });
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

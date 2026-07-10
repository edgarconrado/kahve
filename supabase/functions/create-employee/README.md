# Edge Function: create-employee

Alta de personal por el admin de cada organización, desde la app.

## Despliegue

    npx supabase functions deploy create-employee

(Sin --no-verify-jwt: aquí SÍ queremos que Supabase exija un JWT
válido; la función además verifica que el rol sea admin.)

## Uso desde la app

La pantalla Equipo la invoca con el cliente de Supabase, que adjunta
el JWT del usuario automáticamente:

    const { data, error } = await supabase.functions.invoke(
      'create-employee',
      { body: { fullName, email, pin, role, branchId } },
    );

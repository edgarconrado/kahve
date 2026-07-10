# Edge Function: onboard

Alta de clientes nuevos de Kahve.

## Despliegue (una sola vez)

    # Vincula el proyecto si no lo has hecho (pide el project ref del dashboard)
    npx supabase login
    npx supabase link --project-ref TU-PROJECT-REF

    # Define el secreto que protege la función (inventa uno largo)
    npx supabase secrets set ONBOARDING_SECRET=un-secreto-largo-y-aleatorio

    # Despliega
    npx supabase functions deploy onboard --no-verify-jwt

Nota: --no-verify-jwt porque quien llama no es un usuario de la app;
la autorización la hace el header x-onboarding-secret.
SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ya vienen inyectadas
automáticamente en el runtime de Edge Functions.

## Uso: dar de alta un cliente

    curl -X POST \
      https://TU-PROYECTO.supabase.co/functions/v1/onboard \
      -H "Content-Type: application/json" \
      -H "x-onboarding-secret: un-secreto-largo-y-aleatorio" \
      -d '{
        "orgName": "Café La Borra",
        "orgSlug": "la-borra",
        "branchName": "Sucursal Centro",
        "ownerName": "Juan Pérez",
        "ownerEmail": "juan@laborra.mx",
        "ownerPin": "482910"
      }'

Respuesta exitosa: { "ok": true, "organizationId": "...", ... }
El dueño entra de inmediato a la app con su correo y PIN, y desde
ahí (rol admin) gestiona su menú y su equipo.

## Errores comunes
- 401: el header x-onboarding-secret no coincide con el secreto.
- 422 "slug ya existe": elige otro orgSlug; la función borra el
  usuario de auth creado para no dejar huérfanos.
- 422 "usuario ya registrado": ese correo ya tiene cuenta.

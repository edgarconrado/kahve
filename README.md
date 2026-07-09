# Kahve — Punto de venta para cafeterías

App de personal (POS) construida con Expo + Supabase.
Roles: admin, supervisor, cajero, barista.

## Setup

1. Crea el proyecto base y copia estos archivos encima:

   npx create-expo-app@latest kahve --template blank-typescript
   cd kahve
   npx expo install expo-router expo-constants expo-linking expo-status-bar \
     react-native-safe-area-context react-native-screens \
     @react-native-async-storage/async-storage react-native-url-polyfill
   npm install @supabase/supabase-js zustand

2. En app.json agrega:
   "scheme": "kahve",
   "main": "expo-router/entry" (en package.json)

3. Corre `kahve_schema.sql` en el SQL Editor de tu proyecto Supabase.

4. Copia `.env.example` a `.env` y llena tus llaves.

## Modelo de autenticación

Cada empleado tiene su cuenta en auth.users y su fila en `employees`
(ligada por auth_user_id). El "PIN" del login es la contraseña de
Supabase (4-6 dígitos). Esto mantiene las políticas RLS por rol
funcionando de forma nativa.

Trade-off: un PIN corto como contraseña es débil para una cuenta
expuesta a internet. Mitigaciones recomendadas antes de producción:
- Restringir el login a los dispositivos de la sucursal (device check).
- O usar contraseña fuerte por empleado + PIN local solo para
  desbloquear la sesión ya iniciada en el dispositivo.

## Estructura

  app/
    _layout.tsx        Provider de auth + stack raíz
    index.tsx          Redirección según sesión
    login.tsx          Login con email + PIN
    (app)/
      _layout.tsx      Tabs filtradas por rol
      pos.tsx          Toma de orden (cajero+)
      queue.tsx        Cola de preparación (todos)
      reports.tsx      Reportes (supervisor+)
      profile.tsx      Perfil y cierre de sesión
      admin/
        team.tsx       Equipo y roles (admin)
        menu.tsx       Edición de menú (admin)
  lib/
    supabase.ts        Cliente de Supabase
    auth.tsx           Contexto: sesión + empleado + rol
    permissions.ts     Mapa de permisos por rol
  store/
    cart.ts            Carrito (zustand)
  types/
    db.ts              Tipos del esquema

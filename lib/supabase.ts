import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

// Diagnóstico: en builds de EAS las variables vienen de eas.json, no del .env.
// Si faltan o traen el placeholder, la app muestra una pantalla explicativa
// en lugar de cerrarse en silencio.
export const configError =
  !supabaseUrl.startsWith('https://') ||
  supabaseAnonKey.length < 40 ||
  supabaseAnonKey.includes('PEGA');

export const supabase = createClient(
  configError ? 'https://config-error.supabase.co' : supabaseUrl,
  configError ? 'clave-faltante-revisa-eas-json' : supabaseAnonKey,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);

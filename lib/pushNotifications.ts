import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { supabase } from './supabase';
import type { Employee } from '../types/db';

// Cómo se comporta una notificación si llega con la app ABIERTA
// (en primer plano): se muestra igual, con sonido.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function registerToken(employee: Employee) {
  if (Platform.OS === 'web') return;

  const { status: existing } = await Notifications.getPermissionsAsync();
  let status = existing;
  if (status !== 'granted') {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  if (status !== 'granted') return; // el empleado no dio permiso, no insistimos

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  if (!token) return;

  await supabase.from('push_tokens').upsert(
    { employee_id: employee.id, token, platform: Platform.OS, updated_at: new Date().toISOString() },
    { onConflict: 'token' },
  );
}

// Se llama una vez, con sesión iniciada — registra o actualiza el token
// de este dispositivo silenciosamente (sin bloquear ni interrumpir).
export function usePushNotifications(employee: Employee | null) {
  useEffect(() => {
    if (!employee) return;
    registerToken(employee).catch(() => {});
  }, [employee?.id]);
}

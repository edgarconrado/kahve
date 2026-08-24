import { useAuth } from '../lib/auth';
import { usePushNotifications } from '../lib/pushNotifications';

// Componente "invisible": solo existe para tener acceso a useAuth()
// (que requiere estar DENTRO de AuthProvider) y registrar el token de
// notificaciones push de este dispositivo en cuanto hay sesión iniciada.
export default function PushNotificationsSetup() {
  const { employee } = useAuth();
  usePushNotifications(employee);
  return null;
}

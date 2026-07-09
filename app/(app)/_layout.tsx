import { Redirect, Tabs } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { can } from '../../lib/permissions';

export default function AppLayout() {
  const { session, employee, loading } = useAuth();

  if (loading) return null;
  if (!session) return <Redirect href="/login" />;
  if (!employee) return null; // cargando la fila de employees

  const role = employee.role;

  return (
    <Tabs screenOptions={{ headerShown: true }}>
      <Tabs.Screen
        name="pos"
        options={{
          title: 'Vender',
          href: can(role, 'pos.sell') ? '/(app)/pos' : null,
        }}
      />
      <Tabs.Screen
        name="queue"
        options={{
          title: 'Cola',
          href: can(role, 'queue.view') ? '/(app)/queue' : null,
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: 'Reportes',
          href: can(role, 'reports.view') ? '/(app)/reports' : null,
        }}
      />
      <Tabs.Screen
        name="admin/team"
        options={{
          title: 'Equipo',
          href: can(role, 'team.manage') ? '/(app)/admin/team' : null,
        }}
      />
      <Tabs.Screen
        name="admin/menu"
        options={{
          title: 'Menú',
          href: can(role, 'menu.edit') ? '/(app)/admin/menu' : null,
        }}
      />
      <Tabs.Screen name="profile" options={{ title: 'Perfil' }} />

      {/* Rutas navegables pero sin pestaña propia */}
      <Tabs.Screen name="charge" options={{ title: 'Cobrar', href: null }} />
      <Tabs.Screen name="shift" options={{ title: 'Turno', href: null }} />
    </Tabs>
  );
}

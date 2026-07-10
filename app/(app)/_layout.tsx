import { Redirect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../lib/auth';
import { can } from '../../lib/permissions';

type IoniconName = keyof typeof Ionicons.glyphMap;

const icon =
  (name: IoniconName, nameOutline: IoniconName) =>
  ({ color, size, focused }: { color: string; size: number; focused: boolean }) =>
    <Ionicons name={focused ? name : nameOutline} size={size} color={color} />;

export default function AppLayout() {
  const { session, employee, loading } = useAuth();

  if (loading) return null;
  if (!session) return <Redirect href="/login" />;
  if (!employee) return null; // cargando la fila de employees

  const role = employee.role;

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: '#4A1B0C',
        tabBarInactiveTintColor: '#9a9a9a',
      }}
    >
      <Tabs.Screen
        name="pos"
        options={{
          title: 'Vender',
          href: can(role, 'pos.sell') ? '/(app)/pos' : null,
          tabBarIcon: icon('cafe', 'cafe-outline'),
        }}
      />
      <Tabs.Screen
        name="queue"
        options={{
          title: 'Cola',
          href: can(role, 'queue.view') ? '/(app)/queue' : null,
          tabBarIcon: icon('list', 'list-outline'),
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: 'Reportes',
          href: can(role, 'reports.view') ? '/(app)/reports' : null,
          tabBarIcon: icon('bar-chart', 'bar-chart-outline'),
        }}
      />
      <Tabs.Screen
        name="admin/team"
        options={{
          title: 'Equipo',
          href: can(role, 'team.manage') ? '/(app)/admin/team' : null,
          tabBarIcon: icon('people', 'people-outline'),
        }}
      />
      <Tabs.Screen
        name="admin/menu"
        options={{
          title: 'Menú',
          href: can(role, 'menu.edit') ? '/(app)/admin/menu' : null,
          tabBarIcon: icon('clipboard', 'clipboard-outline'),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Perfil',
          tabBarIcon: icon('person', 'person-outline'),
        }}
      />

      {/* Rutas navegables pero sin pestaña propia */}
      <Tabs.Screen name="charge" options={{ title: 'Cobrar', href: null }} />
      <Tabs.Screen name="board"
        options={{ title: 'Órdenes listas', href: null, headerShown: false }} />
      <Tabs.Screen name="shift" options={{ title: 'Turno', href: null }} />
    </Tabs>
  );
}

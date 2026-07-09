import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../lib/auth';
import { useOpenShift } from '../../lib/shift';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  supervisor: 'Supervisor',
  cajero: 'Cajero',
  barista: 'Barista',
};

export default function Profile() {
  const { employee, signOut } = useAuth();
  const { shift } = useOpenShift(employee);

  const handleSignOut = async () => {
    await signOut();
    router.replace('/login');
  };

  return (
    <View style={styles.container}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>
          {employee?.full_name?.slice(0, 2).toUpperCase() ?? '··'}
        </Text>
      </View>
      <Text style={styles.name}>{employee?.full_name}</Text>
      <Text style={styles.role}>{ROLE_LABELS[employee?.role ?? ''] ?? ''}</Text>

      <Pressable style={styles.row} onPress={() => router.push('/(app)/shift')}>
        <Text style={styles.rowText}>
          {shift ? 'Corte de caja / cerrar turno' : 'Abrir turno'}
        </Text>
      </Pressable>

      <Pressable style={styles.signOut} onPress={handleSignOut}>
        <Text style={styles.signOutText}>Cerrar sesión</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', paddingTop: 48, gap: 6 },
  avatar: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: '#FAECE7',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 22, fontWeight: '600', color: '#712B13' },
  name: { fontSize: 18, fontWeight: '600', marginTop: 8 },
  role: { fontSize: 13, color: '#666' },
  row: {
    marginTop: 24, borderWidth: 1, borderColor: '#ddd',
    borderRadius: 10, paddingVertical: 12, paddingHorizontal: 28,
  },
  rowText: { fontSize: 14, fontWeight: '500' },
  signOut: {
    marginTop: 12, borderWidth: 1, borderColor: '#A32D2D',
    borderRadius: 10, paddingVertical: 12, paddingHorizontal: 28,
  },
  signOutText: { color: '#A32D2D', fontWeight: '600' },
});

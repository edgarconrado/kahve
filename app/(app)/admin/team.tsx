import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../../../lib/supabase';
import type { Employee } from '../../../types/db';

export default function Team() {
  const [team, setTeam] = useState<Employee[]>([]);

  useEffect(() => {
    supabase
      .from('employees')
      .select('*')
      .eq('is_active', true)
      .order('full_name')
      .then(({ data }) => setTeam(data ?? []));
  }, []);

  return (
    <FlatList
      data={team}
      keyExtractor={(e) => e.id}
      contentContainerStyle={{ padding: 16, gap: 10 }}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{item.full_name}</Text>
            <Text style={styles.email}>{item.email}</Text>
          </View>
          <Text style={styles.role}>{item.role}</Text>
        </View>
      )}
    />
  );
  // TODO: alta de empleado (crea auth user vía Edge Function con
  // service_role; el anon key no puede crear usuarios) y cambio de rol
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: '#e5e5e5', borderRadius: 12, padding: 14,
  },
  name: { fontSize: 15, fontWeight: '600' },
  email: { fontSize: 12, color: '#666', marginTop: 2 },
  role: { fontSize: 12, fontWeight: '600', color: '#4A1B0C' },
});

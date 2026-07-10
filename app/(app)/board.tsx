import { useCallback, useEffect, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import type { Order } from '../../types/db';

// Pantalla para mostrar de cara al cliente (tablet en la barra):
// órdenes LISTAS en grande, y las que vienen en preparación abajo.
export default function Board() {
  const { employee } = useAuth();
  const [ready, setReady] = useState<Order[]>([]);
  const [preparing, setPreparing] = useState<Order[]>([]);

  const load = useCallback(async () => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from('orders')
      .select('*')
      .in('status', ['lista', 'en_preparacion', 'pagada'])
      .gte('created_at', today.toISOString())
      .order('ready_at', { ascending: false, nullsFirst: false })
      .order('created_at');
    const rows = (data as Order[]) ?? [];
    setReady(rows.filter((o) => o.status === 'lista').slice(0, 6));
    setPreparing(rows.filter((o) => o.status !== 'lista'));
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    if (!employee) return;
    const channel = supabase
      .channel('kahve-board')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'orders' }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [employee, load]);

  const displayName = (o: Order) =>
    o.customer_name?.toUpperCase() || `#${String(o.order_number).padStart(3, '0')}`;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.brand}>☕ Kahve</Text>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={24} color="#F5C4B3" />
        </Pressable>
      </View>

      <Text style={styles.sectionReady}>LISTAS PARA RECOGER</Text>
      <ScrollView contentContainerStyle={styles.readyArea}>
        {ready.length === 0 ? (
          <Text style={styles.emptyReady}>Preparando tu orden…</Text>
        ) : (
          ready.map((o) => (
            <View key={o.id} style={styles.readyCard}>
              <Ionicons name="checkmark-circle" size={30} color="#5DCAA5" />
              <Text style={styles.readyName}>{displayName(o)}</Text>
            </View>
          ))
        )}
      </ScrollView>

      {preparing.length > 0 && (
        <View style={styles.preparingBar}>
          <Text style={styles.preparingLabel}>En preparación:</Text>
          <Text style={styles.preparingNames} numberOfLines={1}>
            {preparing.map(displayName).join('  ·  ')}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#4A1B0C', paddingTop: 48 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingHorizontal: 24, marginBottom: 8,
  },
  brand: { color: '#FAECE7', fontSize: 20, fontWeight: '700' },
  sectionReady: {
    color: '#F0997B', fontSize: 14, fontWeight: '700',
    letterSpacing: 2, textAlign: 'center', marginVertical: 10,
  },
  readyArea: { padding: 24, paddingTop: 8, gap: 14, flexGrow: 1 },
  emptyReady: {
    color: '#B27358', fontSize: 22, textAlign: 'center', marginTop: 60,
  },
  readyCard: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    backgroundColor: '#5E2812', borderRadius: 18,
    paddingVertical: 20, paddingHorizontal: 24,
  },
  readyName: { color: '#FAECE7', fontSize: 38, fontWeight: '800', flexShrink: 1 },
  preparingBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#3A150A', paddingVertical: 14, paddingHorizontal: 24,
  },
  preparingLabel: { color: '#B27358', fontSize: 13, fontWeight: '600' },
  preparingNames: { color: '#F5C4B3', fontSize: 13, flex: 1 },
});

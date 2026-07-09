import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { can } from '../../lib/permissions';
import type { Order } from '../../types/db';

const ACTIVE = ['pagada', 'en_preparacion'];

export default function Queue() {
  const { employee } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);

  const load = async () => {
    const { data } = await supabase
      .from('orders')
      .select('*')
      .in('status', ACTIVE)
      .order('created_at');
    setOrders(data ?? []);
  };

  useEffect(() => {
    if (!employee) return;
    load();

    // Realtime: la cola se actualiza sola cuando el cajero cobra
    const channel = supabase
      .channel('kahve-queue')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `branch_id=eq.${employee.branch_id}`,
        },
        load,
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [employee]);

  const advance = async (order: Order) => {
    const next = order.status === 'pagada' ? 'en_preparacion' : 'lista';
    const patch: Record<string, unknown> = { status: next };
    if (next === 'en_preparacion') patch.prepared_by = employee?.id;
    if (next === 'lista') patch.ready_at = new Date().toISOString();
    await supabase.from('orders').update(patch).eq('id', order.id);
  };

  const canPrepare = can(employee?.role ?? null, 'queue.prepare');

  return (
    <FlatList
      data={orders}
      keyExtractor={(o) => o.id}
      contentContainerStyle={{ padding: 16, gap: 10 }}
      ListEmptyComponent={
        <Text style={styles.empty}>Sin órdenes pendientes. La cola está al día.</Text>
      }
      renderItem={({ item }) => (
        <View style={styles.card}>
          <View style={{ flex: 1 }}>
            <Text style={styles.orderNumber}>
              #{String(item.order_number).padStart(3, '0')}
              {item.customer_name ? ` · ${item.customer_name}` : ''}
            </Text>
            <Text style={styles.status}>
              {item.status === 'pagada' ? 'Pendiente' : 'En preparación'}
            </Text>
          </View>
          {canPrepare && (
            <Pressable style={styles.button} onPress={() => advance(item)}>
              <Text style={styles.buttonText}>
                {item.status === 'pagada' ? 'Iniciar' : 'Marcar lista'}
              </Text>
            </Pressable>
          )}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  empty: { textAlign: 'center', color: '#888', marginTop: 40 },
  card: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: '#e5e5e5', borderRadius: 12, padding: 14,
  },
  orderNumber: { fontSize: 15, fontWeight: '600' },
  status: { fontSize: 12, color: '#666', marginTop: 2 },
  button: {
    backgroundColor: '#4A1B0C', borderRadius: 8,
    paddingVertical: 8, paddingHorizontal: 14,
  },
  buttonText: { color: '#FAECE7', fontSize: 13, fontWeight: '600' },
});

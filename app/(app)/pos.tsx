import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { useOpenShift } from '../../lib/shift';
import { useCart, cartTotals } from '../../store/cart';
import type { Product } from '../../types/db';

export default function Pos() {
  const { employee } = useAuth();
  const { shift, loading } = useOpenShift(employee);
  const cart = useCart();
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    supabase
      .from('products')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => setProducts(data ?? []));
  }, []);

  const { total } = cartTotals(cart.subtotal());

  if (!loading && !shift) {
    return (
      <View style={styles.center}>
        <Text style={styles.noShiftTitle}>No hay turno abierto</Text>
        <Text style={styles.noShiftText}>
          Abre un turno para empezar a vender.
        </Text>
        <Pressable
          style={styles.primaryButton}
          onPress={() => router.push('/(app)/shift')}
        >
          <Text style={styles.primaryButtonText}>Abrir turno</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={products}
        keyExtractor={(p) => p.id}
        numColumns={2}
        columnWrapperStyle={{ gap: 10 }}
        contentContainerStyle={{ gap: 10, padding: 16 }}
        renderItem={({ item }) => (
          <Pressable
            style={[styles.card, !item.is_available && styles.cardDisabled]}
            disabled={!item.is_available}
            onPress={() => cart.add(item)}
          >
            <Text style={styles.cardName}>{item.name}</Text>
            <Text style={styles.cardPrice}>
              {item.is_available ? `$${item.base_price}` : 'Agotado'}
            </Text>
          </Pressable>
        )}
      />

      {cart.lines.length > 0 && (
        <View style={styles.ticketBar}>
          <View>
            <Text style={styles.ticketCount}>
              {cart.lines.reduce((a, l) => a + l.quantity, 0)} artículos
            </Text>
            <Text style={styles.ticketTotal}>${total.toFixed(2)}</Text>
          </View>
          <Pressable
            style={styles.chargeButton}
            onPress={() => router.push('/(app)/charge')}
          >
            <Text style={styles.chargeText}>Cobrar</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8, padding: 24 },
  noShiftTitle: { fontSize: 17, fontWeight: '600' },
  noShiftText: { fontSize: 13, color: '#666', textAlign: 'center' },
  primaryButton: {
    marginTop: 12, backgroundColor: '#4A1B0C', borderRadius: 10,
    paddingVertical: 12, paddingHorizontal: 28,
  },
  primaryButtonText: { color: '#FAECE7', fontWeight: '600' },
  card: {
    flex: 1, borderWidth: 1, borderColor: '#e5e5e5', borderRadius: 12,
    padding: 16, alignItems: 'center', gap: 4,
  },
  cardDisabled: { opacity: 0.4 },
  cardName: { fontSize: 14, fontWeight: '600' },
  cardPrice: { fontSize: 13, color: '#666' },
  ticketBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#4A1B0C', padding: 16,
  },
  ticketCount: { color: '#F5C4B3', fontSize: 12 },
  ticketTotal: { color: '#FAECE7', fontSize: 20, fontWeight: '600' },
  chargeButton: {
    backgroundColor: '#F0997B', borderRadius: 20,
    paddingVertical: 10, paddingHorizontal: 24,
  },
  chargeText: { color: '#4A1B0C', fontWeight: '600', fontSize: 15 },
});

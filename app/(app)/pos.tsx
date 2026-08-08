import { useCallback, useMemo, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import {
  FlatList, Image, Pressable, StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { useOpenShift } from '../../lib/shift';
import { useCart, cartTotals } from '../../store/cart';
import ProductModal from '../../components/ProductModal';
import TicketSheet from '../../components/TicketSheet';
import type { Modifier, Product } from '../../types/db';

type ProductWithModifiers = Product & { modifiers: Modifier[] };
interface Category { id: string; name: string; sort_order: number }

// Paleta rotativa para los iconos de producto (como en los mockups)
const TINTS = [
  { bg: '#FAEEDA', fg: '#BA7517' },
  { bg: '#E1F5EE', fg: '#0F6E56' },
  { bg: '#FAECE7', fg: '#993C1D' },
  { bg: '#FBEAF0', fg: '#993556' },
];

export default function Pos() {
  const { width } = useWindowDimensions();
  // Más columnas cuando hay más ancho (tablets y landscape).
  const numColumns = width >= 900 ? 4 : width >= 640 ? 3 : 2;
  const { employee } = useAuth();
  const { shift, loading } = useOpenShift(employee);
  const cart = useCart();
  const [products, setProducts] = useState<ProductWithModifiers[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState<string>('all');
  const [selected, setSelected] = useState<ProductWithModifiers | null>(null);
  const [showTicket, setShowTicket] = useState(false);

  // Recarga al recuperar foco: así el POS refleja de inmediato los
  // cambios hechos en Menú (agotados, precios, productos nuevos)
  useFocusEffect(
    useCallback(() => {
      supabase
        .from('products')
        .select('*, modifiers(*), product_categories(sort_order, name)')
        .eq('is_active', true)
        .then(({ data }) => {
          // Orden estable: por categoría (su sort_order) y por nombre
          const rows = ((data as any[]) ?? []).sort((a, b) => {
            const catDiff = (a.product_categories?.sort_order ?? 999)
              - (b.product_categories?.sort_order ?? 999);
            if (catDiff !== 0) return catDiff;
            return a.name.localeCompare(b.name, 'es');
          });
          setProducts(rows as ProductWithModifiers[]);
        });
      supabase
        .from('product_categories')
        .select('id, name, sort_order')
        .eq('is_active', true)
        .order('sort_order')
        .then(({ data }) => setCategories(data ?? []));
    }, []),
  );

  const visible = useMemo(
    () => (categoryId === 'all'
      ? products
      : products.filter((p) => p.category_id === categoryId)),
    [products, categoryId],
  );

  // Cantidad de cada producto ya en el ticket (para el badge)
  const inCart = useMemo(() => {
    const map: Record<string, number> = {};
    cart.lines.forEach((l) => {
      map[l.product.id] = (map[l.product.id] ?? 0) + l.quantity;
    });
    return map;
  }, [cart.lines]);

  const { total } = cartTotals(cart.subtotal());
  const itemCount = cart.lines.reduce((a, l) => a + l.quantity, 0);

  const handleProductPress = (product: ProductWithModifiers) => {
    const activeModifiers = product.modifiers?.filter((m) => m.is_active !== false) ?? [];
    if (activeModifiers.length === 0) {
      cart.add(product);
      return;
    }
    setSelected(product);
  };

  if (!loading && !shift) {
    return (
      <View style={styles.center}>
        <Ionicons name="cafe-outline" size={44} color="#4A1B0C" />
        <Text style={styles.noShiftTitle}>No hay turno abierto</Text>
        <Text style={styles.noShiftText}>Abre un turno para empezar a vender.</Text>
        <Pressable style={styles.primaryButton} onPress={() => router.push('/(app)/shift')}>
          <Text style={styles.primaryButtonText}>Abrir turno</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Chips de categoría */}
      <View style={styles.chipRow}>
        <Pressable
          style={[styles.chip, categoryId === 'all' && styles.chipOn]}
          onPress={() => setCategoryId('all')}
        >
          <Text style={[styles.chipText, categoryId === 'all' && styles.chipTextOn]}>
            Todos
          </Text>
        </Pressable>
        {categories.map((c) => (
          <Pressable
            key={c.id}
            style={[styles.chip, categoryId === c.id && styles.chipOn]}
            onPress={() => setCategoryId(c.id)}
          >
            <Text style={[styles.chipText, categoryId === c.id && styles.chipTextOn]}>
              {c.name}
            </Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={visible}
        keyExtractor={(p) => p.id}
        key={numColumns} // FlatList no permite cambiar numColumns sin remontar
        numColumns={numColumns}
        columnWrapperStyle={{ gap: 12 }}
        contentContainerStyle={{ gap: 12, padding: 16, paddingTop: 8 }}
        renderItem={({ item, index }) => {
          const tint = TINTS[index % TINTS.length];
          const qty = inCart[item.id] ?? 0;
          return (
            <Pressable
              style={[
                styles.card,
                qty > 0 && styles.cardSelected,
                !item.is_available && styles.cardDisabled,
              ]}
              disabled={!item.is_available}
              onPress={() => handleProductPress(item)}
            >
              {qty > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{qty}</Text>
                </View>
              )}
              {item.image_url ? (
                <Image source={{ uri: item.image_url }} style={styles.productImage} />
              ) : (
                <View style={[styles.iconCircle, { backgroundColor: tint.bg }]}>
                  <Ionicons name="cafe" size={26} color={tint.fg} />
                </View>
              )}
              <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
              {item.description ? (
                <Text style={styles.cardDesc} numberOfLines={1}>{item.description}</Text>
              ) : null}
              <View style={styles.cardFooter}>
                <Text style={styles.cardPrice}>
                  {item.is_available ? `$${Number(item.base_price).toFixed(0)}` : 'Agotado'}
                </Text>
                {item.is_available && (
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {qty > 0 && (
                      <Pressable
                        hitSlop={10}
                        onPress={(e) => {
                          e.stopPropagation?.();
                          cart.decrement(item.id);
                        }}
                        style={styles.minusCircle}
                      >
                        <Ionicons name="remove" size={15} color="#4A1B0C" />
                      </Pressable>
                    )}
                    <View style={styles.addCircle}>
                      <Ionicons
                        name={item.modifiers?.length > 0 ? 'options' : 'add'}
                        size={15}
                        color="#FAECE7"
                      />
                    </View>
                  </View>
                )}
              </View>
            </Pressable>
          );
        }}
      />

      <ProductModal
        product={selected}
        onClose={() => setSelected(null)}
        onAdd={(modifiers, quantity, notes) => {
          if (selected) cart.add(selected, modifiers, quantity, notes);
          setSelected(null);
        }}
      />

      <TicketSheet
        visible={showTicket}
        onClose={() => setShowTicket(false)}
        onCheckout={() => {
          setShowTicket(false);
          router.push('/(app)/charge');
        }}
      />

      {itemCount > 0 && (
        <View style={styles.ticketBar}>
          <Pressable
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
            onPress={() => setShowTicket(true)}
            hitSlop={8}
          >
            <View>
              <Text style={styles.ticketCount}>{itemCount} artículos</Text>
              <Text style={styles.ticketTotal}>${total.toFixed(2)}</Text>
            </View>
            <Ionicons name="chevron-up" size={18} color="#F5C4B3" />
          </Pressable>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable style={styles.clearButton} onPress={cart.clear} hitSlop={8}>
              <Ionicons name="trash-outline" size={20} color="#F5C4B3" />
            </Pressable>
            <Pressable
              style={styles.chargeButton}
              onPress={() => router.push('/(app)/charge')}
            >
              <Text style={styles.chargeText}>Cobrar</Text>
              <Ionicons name="arrow-forward" size={16} color="#4A1B0C" />
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8, padding: 24 },
  noShiftTitle: { fontSize: 17, fontWeight: '600' },
  noShiftText: { fontSize: 13, color: '#666', textAlign: 'center' },
  primaryButton: {
    marginTop: 12, backgroundColor: '#4A1B0C', borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 28,
  },
  primaryButtonText: { color: '#FAECE7', fontWeight: '600' },
  chipRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    paddingHorizontal: 16, paddingTop: 12,
  },
  chip: {
    borderWidth: 1, borderColor: '#e5e5e5', borderRadius: 20,
    paddingVertical: 7, paddingHorizontal: 16, backgroundColor: '#fff',
  },
  chipOn: { backgroundColor: '#4A1B0C', borderColor: '#4A1B0C' },
  chipText: { fontSize: 13, color: '#555' },
  chipTextOn: { color: '#FAECE7', fontWeight: '600' },
  card: {
    flex: 1, borderWidth: 1, borderColor: '#eee', borderRadius: 16,
    padding: 14, gap: 3, backgroundColor: '#fff',
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  cardSelected: { borderColor: '#4A1B0C', borderWidth: 2 },
  cardDisabled: { opacity: 0.45 },
  badge: {
    position: 'absolute', top: -7, right: -7, zIndex: 1,
    minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 5,
    backgroundColor: '#D85A30', alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { color: '#FAECE7', fontSize: 12, fontWeight: '700' },
  productImage: {
    width: '100%', height: 76, borderRadius: 12, marginBottom: 4,
  },
  iconCircle: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  cardName: { fontSize: 14, fontWeight: '600', color: '#222' },
  cardDesc: { fontSize: 11, color: '#888' },
  cardFooter: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginTop: 6,
  },
  cardPrice: { fontSize: 15, fontWeight: '600', color: '#222' },
  minusCircle: {
    width: 26, height: 26, borderRadius: 13,
    borderWidth: 1.5, borderColor: '#4A1B0C', backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  addCircle: {
    width: 26, height: 26, borderRadius: 13, backgroundColor: '#4A1B0C',
    alignItems: 'center', justifyContent: 'center',
  },
  ticketBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#4A1B0C', padding: 16, paddingBottom: 20,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
  },
  ticketCount: { color: '#F5C4B3', fontSize: 12 },
  ticketTotal: { color: '#FAECE7', fontSize: 22, fontWeight: '700' },
  clearButton: { alignSelf: 'center', padding: 8 },
  chargeButton: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#F0997B', borderRadius: 24,
    paddingVertical: 12, paddingHorizontal: 22,
  },
  chargeText: { color: '#4A1B0C', fontWeight: '700', fontSize: 15 },
});

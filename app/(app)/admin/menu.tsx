import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Switch, Text, View } from 'react-native';
import { supabase } from '../../../lib/supabase';
import type { Product } from '../../../types/db';

export default function Menu() {
  const [products, setProducts] = useState<Product[]>([]);

  const load = () =>
    supabase
      .from('products')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => setProducts(data ?? []));

  useEffect(() => { load(); }, []);

  // El switch de disponible/agotado es la acción más frecuente del día
  const toggleAvailable = async (product: Product) => {
    setProducts((ps) =>
      ps.map((p) =>
        p.id === product.id ? { ...p, is_available: !p.is_available } : p,
      ),
    );
    await supabase
      .from('products')
      .update({ is_available: !product.is_available })
      .eq('id', product.id);
  };

  return (
    <FlatList
      data={products}
      keyExtractor={(p) => p.id}
      contentContainerStyle={{ padding: 16, gap: 10 }}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.price}>${item.base_price}</Text>
          </View>
          <Switch
            value={item.is_available}
            onValueChange={() => toggleAvailable(item)}
          />
        </View>
      )}
    />
  );
  // TODO: edición de nombre/precio/modificadores y alta de productos
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: '#e5e5e5', borderRadius: 12, padding: 14,
  },
  name: { fontSize: 15, fontWeight: '600' },
  price: { fontSize: 12, color: '#666', marginTop: 2 },
});

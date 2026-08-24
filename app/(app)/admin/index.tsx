import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const SECTIONS: {
  route: string; title: string; subtitle: string; icon: keyof typeof Ionicons.glyphMap;
}[] = [
  {
    route: '/(app)/admin/menu', title: 'Menú',
    subtitle: 'Productos, precios, modificadores y recetas',
    icon: 'restaurant-outline',
  },
  {
    route: '/(app)/admin/team', title: 'Equipo',
    subtitle: 'Empleados, roles y permisos',
    icon: 'people-outline',
  },
  {
    route: '/(app)/admin/supplies', title: 'Insumos',
    subtitle: 'Inventario, compras, mermas y alertas de stock',
    icon: 'cube-outline',
  },
  {
    route: '/(app)/admin/promotions', title: 'Promociones',
    subtitle: '2x1 y descuentos automáticos por cantidad',
    icon: 'pricetags-outline',
  },
];

export default function AdminHub() {
  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <View style={styles.header}>
        <Text style={styles.title}>Administración</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
        {SECTIONS.map((s) => (
          <Pressable key={s.route} style={styles.card}
            onPress={() => router.push(s.route as any)}>
            <View style={styles.iconCircle}>
              <Ionicons name={s.icon} size={22} color="#4A1B0C" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{s.title}</Text>
              <Text style={styles.cardSubtitle}>{s.subtitle}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#bbb" />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingTop: 54, paddingBottom: 14 },
  title: { fontSize: 24, fontWeight: '700', color: '#222' },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderWidth: 1, borderColor: '#eee', borderRadius: 14, padding: 16,
  },
  iconCircle: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: '#FAECE7',
    alignItems: 'center', justifyContent: 'center',
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#222' },
  cardSubtitle: { fontSize: 12, color: '#888', marginTop: 2 },
});

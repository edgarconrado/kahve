import { useCallback, useEffect, useState } from 'react';
import {
  Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

interface Supply {
  id: string; name: string; unit: string; cost_per_unit: number; is_resale: boolean;
  recipe_unit: string | null;
  recipe_unit_factor: number;
}
interface RecipeLine {
  supply_id: string;
  supply_name: string;
  stock_unit: string;      // unidad real de inventario (supplies.unit)
  display_unit: string;    // unidad en la que se captura aquí (recipe_unit || unit)
  factor: number;          // display = stock * factor
  cost_per_unit: number;   // costo por unidad de STOCK
  quantity_used: string;   // como texto mientras se edita, EN display_unit
}

interface Props {
  productId: string | null; // null = producto nuevo, aún no guardado
  basePrice: number;        // para mostrar el % de costo en vivo
  onChange?: (lines: { supply_id: string; quantity_used: number }[]) => void;
}

// Redondea a 4 decimales y quita ceros sobrantes, para no mostrar
// cosas como "500.00000001" por errores de punto flotante.
const formatQty = (n: number) => {
  const rounded = Math.round(n * 10000) / 10000;
  return String(rounded);
};

// Editor de receta: qué insumos y cuánto lleva un producto.
// Se usa dentro del formulario de producto en Menú (admin/menu.tsx).
// Si productId es null (producto todavía no creado), la receta se guarda
// en memoria vía onChange y se persiste después de crear el producto.
//
// Nota sobre unidades: en base de datos (product_supplies.quantity_used)
// SIEMPRE se guarda en la unidad de STOCK del insumo (supplies.unit), para
// no tocar los triggers de consumo de inventario. Si el insumo tiene
// configurada una "unidad de receta" (ej. stock en litros, receta en
// mililitros), aquí se muestra y captura en esa unidad más práctica, y se
// convierte de ida y vuelta con el factor guardado en supplies.
export default function RecipeEditor({ productId, basePrice, onChange }: Props) {
  const [supplies, setSupplies] = useState<Supply[]>([]);
  const [lines, setLines] = useState<RecipeLine[]>([]);
  const [showPicker, setShowPicker] = useState(false);

  // Catálogo de insumos disponibles de la organización
  useEffect(() => {
    supabase
      .from('supplies')
      .select('id, name, unit, cost_per_unit, is_resale, recipe_unit, recipe_unit_factor')
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => setSupplies((data as Supply[]) ?? []));
  }, []);

  // Receta actual del producto (si ya existe)
  const loadRecipe = useCallback(() => {
    if (!productId) return;
    supabase
      .from('product_supplies')
      .select('supply_id, quantity_used, supplies(name, unit, cost_per_unit, recipe_unit, recipe_unit_factor)')
      .eq('product_id', productId)
      .then(({ data }) => {
        const rows = (data as any[]) ?? [];
        setLines(rows.map((r) => {
          const factor = r.supplies?.recipe_unit ? (r.supplies?.recipe_unit_factor || 1) : 1;
          return {
            supply_id: r.supply_id,
            supply_name: r.supplies?.name ?? '—',
            stock_unit: r.supplies?.unit ?? '',
            display_unit: r.supplies?.recipe_unit || r.supplies?.unit || '',
            factor,
            cost_per_unit: r.supplies?.cost_per_unit ?? 0,
            quantity_used: formatQty(Number(r.quantity_used) * factor),
          };
        }));
      });
  }, [productId]);

  useEffect(() => { loadRecipe(); }, [loadRecipe]);

  const notify = (next: RecipeLine[]) => {
    setLines(next);
    onChange?.(next
      .filter((l) => parseFloat(l.quantity_used) > 0)
      .map((l) => ({
        supply_id: l.supply_id,
        // Se guarda siempre en unidad de stock, aunque aquí se capture en
        // la unidad de receta (display_unit / factor).
        quantity_used: parseFloat(l.quantity_used) / l.factor,
      })));
  };

  const addSupply = (s: Supply) => {
    if (lines.some((l) => l.supply_id === s.id)) { setShowPicker(false); return; }
    notify([...lines, {
      supply_id: s.id, supply_name: s.name, stock_unit: s.unit,
      display_unit: s.recipe_unit || s.unit,
      factor: s.recipe_unit ? (s.recipe_unit_factor || 1) : 1,
      cost_per_unit: s.cost_per_unit, quantity_used: '',
    }]);
    setShowPicker(false);
  };

  const setQuantity = (supplyId: string, value: string) => {
    notify(lines.map((l) => l.supply_id === supplyId
      ? { ...l, quantity_used: value.replace(/[^0-9.]/g, '') } : l));
  };

  const removeLine = (supplyId: string) => {
    notify(lines.filter((l) => l.supply_id !== supplyId));
  };

  // Persistir en Supabase (solo aplica si el producto ya existe)
  const persistLine = async (line: RecipeLine) => {
    if (!productId) return; // se guarda al crear el producto, ver nota abajo
    const displayQty = parseFloat(line.quantity_used);
    if (!displayQty || displayQty <= 0) return;
    const stockQty = displayQty / line.factor;
    await supabase.from('product_supplies').upsert({
      product_id: productId, supply_id: line.supply_id, quantity_used: stockQty,
    });
  };

  const persistRemoval = async (supplyId: string) => {
    if (!productId) return;
    await supabase.from('product_supplies')
      .delete().eq('product_id', productId).eq('supply_id', supplyId);
  };

  const totalCost = lines.reduce(
    (a, l) => a + ((parseFloat(l.quantity_used) || 0) / l.factor) * l.cost_per_unit, 0);
  const costPercent = basePrice > 0 ? (totalCost / basePrice) * 100 : 0;
  const availableSupplies = supplies.filter((s) => !lines.some((l) => l.supply_id === s.id));

  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={styles.label}>Receta (opcional)</Text>
        <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
          onPress={() => setShowPicker(true)}>
          <Ionicons name="add-circle-outline" size={16} color="#4A1B0C" />
          <Text style={styles.addText}>Agregar insumo</Text>
        </Pressable>
      </View>

      {lines.length === 0 ? (
        <Text style={styles.emptyHint}>
          Sin receta, este producto no descontará insumos al venderse.
        </Text>
      ) : (
        <>
          {lines.map((l) => (
            <View key={l.supply_id} style={styles.line}>
              <Text style={styles.lineName} numberOfLines={1}>{l.supply_name}</Text>
              <TextInput
                style={styles.lineInput}
                placeholder="0"
                placeholderTextColor="#9A9A9A"
                keyboardType="decimal-pad"
                value={l.quantity_used}
                onChangeText={(v) => setQuantity(l.supply_id, v)}
                onEndEditing={() => persistLine(l)}
              />
              <Text style={styles.lineUnit}>{l.display_unit}</Text>
              <Pressable hitSlop={8} onPress={() => { removeLine(l.supply_id); persistRemoval(l.supply_id); }}>
                <Ionicons name="close-circle" size={18} color="#ccc" />
              </Pressable>
            </View>
          ))}
          <View style={styles.costBox}>
            <Text style={styles.costText}>
              Costo de insumos: ${totalCost.toFixed(2)}
              {basePrice > 0 && ` · ${costPercent.toFixed(0)}% del precio`}
            </Text>
          </View>
        </>
      )}

      <Modal visible={showPicker} transparent animationType="slide" onRequestClose={() => setShowPicker(false)}>
        <Pressable style={styles.backdrop} onPress={() => setShowPicker(false)} />
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>Elige un insumo</Text>
          <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ gap: 6 }}>
            {availableSupplies.length === 0 ? (
              <Text style={styles.emptyHint}>
                No hay más insumos disponibles. Créalos primero en la pestaña Insumos.
              </Text>
            ) : (
              availableSupplies.map((s) => (
                <Pressable key={s.id} style={styles.pickerRow} onPress={() => addSupply(s)}>
                  <Text style={styles.pickerName}>{s.name}</Text>
                  <Text style={styles.pickerUnit}>{s.recipe_unit || s.unit}</Text>
                </Pressable>
              ))
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 12, color: '#888', flex: 1 },
  addText: { fontSize: 12.5, color: '#4A1B0C', fontWeight: '600' },
  emptyHint: { fontSize: 12, color: '#999', fontStyle: 'italic' },
  line: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: '#eee', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 8,
  },
  lineName: { flex: 1, fontSize: 13, color: '#333' },
  lineInput: {
    width: 60, borderWidth: 1, borderColor: '#ddd', borderRadius: 8,
    paddingVertical: 5, paddingHorizontal: 8, fontSize: 13, textAlign: 'right', color: '#1F1F1F',
  },
  lineUnit: { fontSize: 12, color: '#888', width: 30 },
  costBox: { backgroundColor: '#FAECE7', borderRadius: 10, padding: 10 },
  costText: { fontSize: 12.5, color: '#4A1B0C', fontWeight: '600' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 32, gap: 8,
  },
  sheetTitle: { fontSize: 17, fontWeight: '700', marginBottom: 6 },
  pickerRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: '#f5f5f5',
  },
  pickerName: { fontSize: 14, color: '#333' },
  pickerUnit: { fontSize: 12, color: '#999' },
});

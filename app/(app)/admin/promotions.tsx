import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  Alert, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable,
  ScrollView, StyleSheet, Switch, Text, TextInput, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../lib/auth';
import { usePlan, proFeatureAlert } from '../../../lib/plan';

type Scope = 'product' | 'category' | 'combo';

interface Promotion {
  id: string;
  name: string;
  scope: Scope;
  product_id: string | null;
  category_id: string | null;
  buy_quantity: number | null;
  discount_percent: number;
  is_active: boolean;
  trigger_product_id: string | null;
  trigger_quantity: number | null;
  reward_product_id: string | null;
}
interface Option { id: string; name: string }

export default function Promotions() {
  const { employee } = useAuth();
  const { tier } = usePlan(employee);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [products, setProducts] = useState<Option[]>([]);
  const [categories, setCategories] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<Promotion | null>(null);
  const [name, setName] = useState('');
  const [scope, setScope] = useState<Scope>('category');

  // Campos para scope 'product' | 'category'
  const [targetId, setTargetId] = useState<string | null>(null);
  const [buyQuantity, setBuyQuantity] = useState('2');

  // Campos para scope 'combo'
  const [triggerProductId, setTriggerProductId] = useState<string | null>(null);
  const [triggerQuantity, setTriggerQuantity] = useState('1');
  const [rewardProductId, setRewardProductId] = useState<string | null>(null);

  const [discountPercent, setDiscountPercent] = useState('100');
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    supabase.from('promotions').select('*').order('name')
      .then(({ data }) => { setPromotions((data as Promotion[]) ?? []); setLoading(false); });
    supabase.from('products').select('id, name').eq('is_active', true).order('name')
      .then(({ data }) => setProducts(data ?? []));
    supabase.from('product_categories').select('id, name').eq('is_active', true).order('name')
      .then(({ data }) => setCategories(data ?? []));
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const resetForm = () => {
    setName(''); setScope('category'); setTargetId(null); setBuyQuantity('2');
    setTriggerProductId(null); setTriggerQuantity('1'); setRewardProductId(null);
    setDiscountPercent('100');
  };

  const openNew = () => {
    if (tier === 'free') { proFeatureAlert('Las promociones automáticas'); return; }
    setEditTarget(null);
    resetForm();
    setShowForm(true);
  };

  const openEdit = (p: Promotion) => {
    setEditTarget(p);
    setName(p.name); setScope(p.scope);
    setTargetId(p.scope === 'product' ? p.product_id : p.scope === 'category' ? p.category_id : null);
    setBuyQuantity(String(p.buy_quantity ?? 2));
    setTriggerProductId(p.trigger_product_id);
    setTriggerQuantity(String(p.trigger_quantity ?? 1));
    setRewardProductId(p.reward_product_id);
    setDiscountPercent(String(p.discount_percent));
    setShowForm(true);
  };

  const missing = (() => {
    const errs: string[] = [];
    if (!name.trim()) errs.push('nombre');
    const pct = parseFloat(discountPercent) || 0;
    if (pct <= 0 || pct > 100) errs.push('porcentaje entre 1 y 100');
    if (scope === 'combo') {
      if (!triggerProductId) errs.push('producto que activa el combo');
      if (!rewardProductId) errs.push('producto que se premia');
      if ((parseInt(triggerQuantity) || 0) < 1) errs.push('cantidad mínima de 1 para activar');
    } else {
      if (!targetId) errs.push(scope === 'product' ? 'producto' : 'categoría');
      if ((parseInt(buyQuantity) || 0) < 2) errs.push('cantidad mínima de 2');
    }
    return errs;
  })();

  const save = async () => {
    if (missing.length > 0 || !employee) return;
    setSaving(true);
    const payload = scope === 'combo'
      ? {
          name: name.trim(),
          scope,
          product_id: null,
          category_id: null,
          buy_quantity: null,
          trigger_product_id: triggerProductId,
          trigger_quantity: parseInt(triggerQuantity),
          reward_product_id: rewardProductId,
          discount_percent: parseFloat(discountPercent),
        }
      : {
          name: name.trim(),
          scope,
          product_id: scope === 'product' ? targetId : null,
          category_id: scope === 'category' ? targetId : null,
          buy_quantity: parseInt(buyQuantity),
          trigger_product_id: null,
          trigger_quantity: 1,
          reward_product_id: null,
          discount_percent: parseFloat(discountPercent),
        };
    const { error } = editTarget
      ? await supabase.from('promotions').update(payload).eq('id', editTarget.id)
      : await supabase.from('promotions').insert({
          ...payload, organization_id: employee.organization_id,
        });
    setSaving(false);
    if (error) { Alert.alert('Error', error.message); return; }
    setShowForm(false);
    load();
  };

  const toggleActive = async (p: Promotion) => {
    setPromotions((ps) => ps.map((x) => x.id === p.id ? { ...x, is_active: !x.is_active } : x));
    await supabase.from('promotions').update({ is_active: !p.is_active }).eq('id', p.id);
  };

  const deletePromo = (p: Promotion) => {
    Alert.alert(`Eliminar "${p.name}"`, 'Esta acción no se puede deshacer.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive',
        onPress: async () => {
          await supabase.from('promotions').delete().eq('id', p.id);
          setShowForm(false);
          load();
        },
      },
    ]);
  };

  const productName = (id: string | null) => products.find((o) => o.id === id)?.name ?? '—';
  const categoryName = (id: string | null) => categories.find((o) => o.id === id)?.name ?? '—';

  const describe = (p: Promotion) => {
    if (p.scope === 'combo') {
      const qty = p.trigger_quantity ?? 1;
      return `Compra ${qty > 1 ? `${qty}x ` : ''}${productName(p.trigger_product_id)} → `
        + `${productName(p.reward_product_id)} con ${p.discount_percent}% off`;
    }
    const target = p.scope === 'product' ? productName(p.product_id) : categoryName(p.category_id);
    return `${p.scope === 'product' ? 'Producto' : 'Categoría'}: ${target} · `
      + `cada ${p.buy_quantity} unidades, ${p.discount_percent}% en la más barata`;
  };

  const targetOptions = scope === 'category' ? categories : products;

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="pricetags-outline" size={22} color="#4A1B0C" />
          <Text style={styles.title}>Promociones</Text>
        </View>
      </View>

      {tier === 'free' ? (
        <View style={styles.lockedBox}>
          <Ionicons name="lock-closed-outline" size={28} color="#bbb" />
          <Text style={styles.lockedTitle}>Función de Kahve Pro</Text>
          <Text style={styles.lockedText}>
            Las promociones automáticas (2x1, combos, etc.) están
            disponibles en el plan Pro.
          </Text>
        </View>
      ) : (
        <FlatList
          data={promotions}
          keyExtractor={(p) => p.id}
          refreshing={loading}
          onRefresh={load}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 100 }}
          ListEmptyComponent={
            !loading ? (
              <Text style={styles.empty}>
                Aún no tienes promociones. Crea la primera con el botón +.
              </Text>
            ) : null
          }
          renderItem={({ item }) => (
            <Pressable style={styles.card} onPress={() => openEdit(item)}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[styles.name, !item.is_active && { color: '#bbb' }]}>
                    {item.name}
                  </Text>
                  {item.scope === 'combo' && (
                    <View style={styles.comboTag}>
                      <Text style={styles.comboTagText}>combo</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.detail}>{describe(item)}</Text>
              </View>
              <Switch value={item.is_active} onValueChange={() => toggleActive(item)}
                trackColor={{ true: '#1D9E75' }} />
            </Pressable>
          )}
        />
      )}

      {tier !== 'free' && (
        <Pressable style={styles.fab} onPress={openNew}>
          <Ionicons name="add" size={26} color="#FAECE7" />
        </Pressable>
      )}

      <Modal visible={showForm} transparent animationType="slide" onRequestClose={() => setShowForm(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable style={styles.backdrop} onPress={() => setShowForm(false)} />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>
              {editTarget ? 'Editar promoción' : 'Nueva promoción'}
            </Text>
            <ScrollView contentContainerStyle={{ gap: 10 }}>
              <TextInput style={styles.input}
                placeholder="Nombre (ej. Café + dona gratis)"
                placeholderTextColor="#9A9A9A" value={name} onChangeText={setName} />

              <Text style={styles.label}>Tipo de promoción</Text>
              <View style={styles.chipRow}>
                {([
                  ['category', 'Cantidad · categoría'],
                  ['product', 'Cantidad · producto'],
                  ['combo', 'Combo (2 productos)'],
                ] as [Scope, string][]).map(([s, label]) => (
                  <Pressable key={s}
                    style={[styles.chip, scope === s && styles.chipOn]}
                    onPress={() => { setScope(s); setTargetId(null); }}>
                    <Text style={[styles.chipText, scope === s && styles.chipTextOn]}>
                      {label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {scope === 'combo' ? (
                <>
                  <Text style={styles.hint}>
                    Ejemplo: "café + dona gratis" — el cliente compra un café
                    (o la cantidad que definas) y se descuenta una dona.
                  </Text>

                  <Text style={styles.label}>Producto que activa el combo</Text>
                  <View style={styles.chipRow}>
                    {products.map((o) => (
                      <Pressable key={o.id}
                        style={[styles.chip, triggerProductId === o.id && styles.chipOn]}
                        onPress={() => setTriggerProductId(o.id)}>
                        <Text style={[styles.chipText, triggerProductId === o.id && styles.chipTextOn]}>
                          {o.name}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  <Text style={styles.label}>Cuántas unidades hay que comprar</Text>
                  <TextInput style={styles.input} placeholder="1"
                    placeholderTextColor="#9A9A9A" keyboardType="number-pad"
                    value={triggerQuantity} onChangeText={setTriggerQuantity} />

                  <Text style={styles.label}>Producto que se premia</Text>
                  <View style={styles.chipRow}>
                    {products.map((o) => (
                      <Pressable key={o.id}
                        style={[styles.chip, rewardProductId === o.id && styles.chipOn]}
                        onPress={() => setRewardProductId(o.id)}>
                        <Text style={[styles.chipText, rewardProductId === o.id && styles.chipTextOn]}>
                          {o.name}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  <Text style={styles.label}>% de descuento en el premio</Text>
                  <TextInput style={styles.input} placeholder="100 = gratis"
                    placeholderTextColor="#9A9A9A" keyboardType="number-pad"
                    value={discountPercent} onChangeText={setDiscountPercent} />
                </>
              ) : (
                <>
                  <Text style={styles.label}>
                    {scope === 'category' ? 'Categoría' : 'Producto'}
                  </Text>
                  <View style={styles.chipRow}>
                    {targetOptions.map((o) => (
                      <Pressable key={o.id}
                        style={[styles.chip, targetId === o.id && styles.chipOn]}
                        onPress={() => setTargetId(o.id)}>
                        <Text style={[styles.chipText, targetId === o.id && styles.chipTextOn]}>
                          {o.name}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.label}>Cada cuántas unidades</Text>
                      <TextInput style={styles.input} placeholder="2"
                        placeholderTextColor="#9A9A9A" keyboardType="number-pad"
                        value={buyQuantity} onChangeText={setBuyQuantity} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.label}>% de descuento</Text>
                      <TextInput style={styles.input} placeholder="100"
                        placeholderTextColor="#9A9A9A" keyboardType="number-pad"
                        value={discountPercent} onChangeText={setDiscountPercent} />
                    </View>
                  </View>
                  <Text style={styles.hint}>
                    Ejemplos: "2 unidades, 100%" = 2x1. "2 unidades, 50%" = el
                    segundo a mitad de precio. Siempre se descuenta la unidad
                    más barata del grupo, automáticamente al cobrar.
                  </Text>
                </>
              )}

              {missing.length > 0 && (
                <Text style={styles.missing}>Falta: {missing.join(', ')}</Text>
              )}

              <Pressable style={[styles.saveButton, (saving || missing.length > 0) && { opacity: 0.5 }]}
                disabled={saving || missing.length > 0} onPress={save}>
                <Text style={styles.saveButtonText}>
                  {saving ? 'Guardando…' : editTarget ? 'Guardar cambios' : 'Crear promoción'}
                </Text>
              </Pressable>

              {editTarget && (
                <Pressable style={styles.deleteButton} onPress={() => deletePromo(editTarget)}>
                  <Ionicons name="trash-outline" size={15} color="#A32D2D" />
                  <Text style={styles.deleteText}>Eliminar promoción</Text>
                </Pressable>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingTop: 54, paddingBottom: 14 },
  title: { fontSize: 24, fontWeight: '700', color: '#222' },
  empty: { textAlign: 'center', color: '#999', fontSize: 13, marginTop: 40 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderColor: '#eee', borderRadius: 14, padding: 14,
  },
  name: { fontSize: 15, fontWeight: '700', color: '#222' },
  comboTag: { backgroundColor: '#EEEDFE', borderRadius: 8, paddingVertical: 1, paddingHorizontal: 7 },
  comboTagText: { fontSize: 9.5, color: '#534AB7', fontWeight: '700' },
  detail: { fontSize: 12, color: '#666', marginTop: 3 },
  fab: {
    position: 'absolute', right: 20, bottom: 24, width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#4A1B0C', alignItems: 'center', justifyContent: 'center', elevation: 4,
  },
  lockedBox: { alignItems: 'center', paddingTop: 90, paddingHorizontal: 40, gap: 8 },
  lockedTitle: { fontSize: 15, fontWeight: '700', color: '#666', marginTop: 4 },
  lockedText: { fontSize: 13, color: '#999', textAlign: 'center', lineHeight: 19 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 32, maxHeight: '85%',
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', marginBottom: 10 },
  label: { fontSize: 12, color: '#888' },
  chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { borderWidth: 1, borderColor: '#ddd', borderRadius: 18, paddingVertical: 8, paddingHorizontal: 14 },
  chipOn: { borderColor: '#4A1B0C', backgroundColor: '#FAECE7' },
  chipText: { fontSize: 13, color: '#444' },
  chipTextOn: { color: '#4A1B0C', fontWeight: '600' },
  input: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10, color: '#1F1F1F',
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 15,
  },
  hint: { fontSize: 11.5, color: '#999', lineHeight: 16 },
  missing: { fontSize: 12, color: '#A32D2D' },
  saveButton: { backgroundColor: '#4A1B0C', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  saveButtonText: { color: '#FAECE7', fontSize: 15, fontWeight: '600' },
  deleteButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1, borderColor: '#A32D2D', borderRadius: 10, paddingVertical: 12, marginTop: 4,
  },
  deleteText: { color: '#A32D2D', fontWeight: '600', fontSize: 13 },
});

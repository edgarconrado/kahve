import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import {
  Alert, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable,
  ScrollView, StyleSheet, Switch, Text, TextInput, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../lib/auth';
import { usePlan, proFeatureAlert, HIDE_PRO_UI } from '../../../lib/plan';

type Scope = 'product' | 'category' | 'combo';
type Kind = 'twoForOne' | 'secondDiscount' | 'combo';

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

const DISCOUNT_CHIPS = [
  { pct: 25, label: '25% menos' },
  { pct: 50, label: 'Mitad de precio' },
  { pct: 75, label: '75% menos' },
];

// Componente propio del archivo (NO definido dentro de Promotions): si
// se define adentro, React lo trata como un componente nuevo en cada
// render — el TextInput pierde el foco y el teclado se cierra con cada
// letra que se escribe. Afuera, conserva su identidad entre renders.
function SearchBox({ value, onChangeText, placeholder }: {
  value: string; onChangeText: (v: string) => void; placeholder: string;
}) {
  return (
    <View style={styles.searchBox}>
      <Ionicons name="search-outline" size={15} color="#999" />
      <TextInput
        style={styles.searchInput}
        placeholderTextColor="#9A9A9A"
        placeholder={placeholder}
        value={value}
        onChangeText={onChangeText}
      />
      {value.length > 0 && (
        <Pressable hitSlop={8} onPress={() => onChangeText('')}>
          <Ionicons name="close-circle" size={15} color="#ccc" />
        </Pressable>
      )}
    </View>
  );
}

export default function Promotions() {
  const { employee } = useAuth();
  const { tier } = usePlan(employee);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [products, setProducts] = useState<Option[]>([]);
  const [categories, setCategories] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<Promotion | null>(null);

  // Paso 1: qué tipo de promoción — null = mostrando las 3 tarjetas
  const [kind, setKind] = useState<Kind | null>(null);
  const [nameOverride, setNameOverride] = useState<string | null>(null);

  // Campos compartidos por "2x1" y "La segunda con descuento"
  const [targetScope, setTargetScope] = useState<'product' | 'category'>('category');
  const [targetId, setTargetId] = useState<string | null>(null);
  const [buyQty, setBuyQty] = useState(2);

  // Solo "La segunda con descuento"
  const [discountPct, setDiscountPct] = useState(50);
  const [customPct, setCustomPct] = useState('');
  const [showCustomPct, setShowCustomPct] = useState(false);

  // Solo "Compra esto, llévate esto"
  const [triggerProductId, setTriggerProductId] = useState<string | null>(null);
  const [triggerQty, setTriggerQty] = useState(1);
  const [rewardProductId, setRewardProductId] = useState<string | null>(null);
  const [rewardFree, setRewardFree] = useState(true);
  const [rewardPct, setRewardPct] = useState(50);

  const [targetSearch, setTargetSearch] = useState('');
  const [triggerSearch, setTriggerSearch] = useState('');
  const [rewardSearch, setRewardSearch] = useState('');

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

  const productName = (id: string | null) => products.find((o) => o.id === id)?.name ?? '—';
  const categoryName = (id: string | null) => categories.find((o) => o.id === id)?.name ?? '—';
  const targetName = () => targetScope === 'product' ? productName(targetId) : categoryName(targetId);

  const resetForm = () => {
    setKind(null); setNameOverride(null);
    setTargetScope('category'); setTargetId(null); setBuyQty(2);
    setDiscountPct(50); setCustomPct(''); setShowCustomPct(false);
    setTriggerProductId(null); setTriggerQty(1);
    setRewardProductId(null); setRewardFree(true); setRewardPct(50);
    setTargetSearch(''); setTriggerSearch(''); setRewardSearch('');
  };

  const openNew = () => {
    if (tier === 'free') { proFeatureAlert('Las promociones automáticas'); return; }
    setEditTarget(null);
    resetForm();
    setShowForm(true);
  };

  const openEdit = (p: Promotion) => {
    setEditTarget(p);
    setNameOverride(p.name);
    if (p.scope === 'combo') {
      setKind('combo');
      setTriggerProductId(p.trigger_product_id);
      setTriggerQty(p.trigger_quantity ?? 1);
      setRewardProductId(p.reward_product_id);
      setRewardFree(p.discount_percent >= 100);
      setRewardPct(p.discount_percent);
    } else {
      setKind(p.discount_percent >= 100 ? 'twoForOne' : 'secondDiscount');
      setTargetScope(p.scope as 'product' | 'category');
      setTargetId(p.scope === 'product' ? p.product_id : p.category_id);
      setBuyQty(p.buy_quantity ?? 2);
      const isPreset = DISCOUNT_CHIPS.some((c) => c.pct === p.discount_percent);
      setDiscountPct(isPreset ? p.discount_percent : 50);
      setShowCustomPct(!isPreset);
      setCustomPct(isPreset ? '' : String(p.discount_percent));
    }
    setShowForm(true);
  };

  // Nombre automático según lo elegido — el admin puede sobrescribirlo
  const autoName = (): string => {
    if (kind === 'twoForOne') {
      return targetId ? `${buyQty}x1 en ${targetName()}` : '';
    }
    if (kind === 'secondDiscount') {
      const pct = showCustomPct ? (parseFloat(customPct) || 0) : discountPct;
      return targetId ? `${targetName()}: 2da unidad ${pct}% menos` : '';
    }
    if (kind === 'combo') {
      if (!triggerProductId || !rewardProductId) return '';
      const rewardLabel = rewardFree ? 'gratis' : `con ${rewardPct}% off`;
      return `${productName(triggerProductId)} + ${productName(rewardProductId)} ${rewardLabel}`;
    }
    return '';
  };
  const effectiveName = nameOverride ?? autoName();

  const finalDiscountPct = kind === 'secondDiscount'
    ? (showCustomPct ? (parseFloat(customPct) || 0) : discountPct)
    : kind === 'combo'
      ? (rewardFree ? 100 : rewardPct)
      : 100;

  const missing = (() => {
    const errs: string[] = [];
    if (!effectiveName.trim()) errs.push('completa los datos de abajo');
    if (kind === 'combo') {
      if (!triggerProductId) errs.push('qué debe comprar el cliente');
      if (!rewardProductId) errs.push('qué se lleva de regalo');
    } else if (kind) {
      if (!targetId) errs.push(targetScope === 'product' ? 'un producto' : 'una categoría');
    }
    if ((kind === 'secondDiscount') && finalDiscountPct <= 0) errs.push('un % de descuento válido');
    return errs;
  })();

  const save = async () => {
    if (!kind || missing.length > 0 || !employee) return;
    setSaving(true);
    const payload = kind === 'combo'
      ? {
          name: effectiveName.trim(),
          scope: 'combo' as Scope,
          product_id: null, category_id: null, buy_quantity: null,
          trigger_product_id: triggerProductId,
          trigger_quantity: triggerQty,
          reward_product_id: rewardProductId,
          discount_percent: finalDiscountPct,
        }
      : {
          name: effectiveName.trim(),
          scope: targetScope,
          product_id: targetScope === 'product' ? targetId : null,
          category_id: targetScope === 'category' ? targetId : null,
          buy_quantity: buyQty,
          trigger_product_id: null, trigger_quantity: 1, reward_product_id: null,
          discount_percent: kind === 'twoForOne' ? 100 : finalDiscountPct,
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

  const describe = (p: Promotion) => {
    if (p.scope === 'combo') {
      const qty = p.trigger_quantity ?? 1;
      return `Compra ${qty > 1 ? `${qty}x ` : ''}${productName(p.trigger_product_id)} → `
        + `${productName(p.reward_product_id)} ${p.discount_percent >= 100 ? 'gratis' : `con ${p.discount_percent}% off`}`;
    }
    const target = p.scope === 'product' ? productName(p.product_id) : categoryName(p.category_id);
    return p.discount_percent >= 100
      ? `${p.buy_quantity}x1 en ${target}`
      : `${target}: 2da unidad con ${p.discount_percent}% de descuento`;
  };

  const targetOptions = targetScope === 'category' ? categories : products;

  const filterOptions = (list: Option[], search: string) => {
    const q = search.trim().toLowerCase();
    return q ? list.filter((o) => o.name.toLowerCase().includes(q)) : list;
  };


  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable onPress={() => router.push('/(app)/admin')} hitSlop={12}>
            <Ionicons name="arrow-back" size={22} color="#4A1B0C" />
          </Pressable>
          <Ionicons name="pricetags-outline" size={20} color="#4A1B0C" />
          <Text style={styles.title}>Promociones</Text>
        </View>
      </View>

      {tier === 'free' ? (
        <View style={styles.lockedBox}>
          <Ionicons name="lock-closed-outline" size={28} color="#bbb" />
          <Text style={styles.lockedTitle}>
            {HIDE_PRO_UI ? 'No disponible' : 'Función de Kahve Pro'}
          </Text>
          <Text style={styles.lockedText}>
            {HIDE_PRO_UI
              ? 'Las promociones automáticas no están disponibles en esta versión.'
              : 'Las promociones automáticas (2x1, combos, etc.) están disponibles en el plan Pro.'}
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
            {/* ---------- Paso 1: elegir el tipo de promoción ---------- */}
            {!kind ? (
              <>
                <Text style={styles.sheetTitle}>¿Qué tipo de promoción quieres crear?</Text>
                <View style={{ gap: 10, marginTop: 4 }}>
                  <Pressable style={styles.kindCard} onPress={() => setKind('twoForOne')}>
                    <Text style={styles.kindEmoji}>🎁</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.kindTitle}>2x1</Text>
                      <Text style={styles.kindSubtitle}>
                        Compra 2 y la segunda es gratis
                      </Text>
                    </View>
                  </Pressable>
                  <Pressable style={styles.kindCard} onPress={() => setKind('secondDiscount')}>
                    <Text style={styles.kindEmoji}>💰</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.kindTitle}>La segunda con descuento</Text>
                      <Text style={styles.kindSubtitle}>
                        Ej. la segunda unidad a mitad de precio
                      </Text>
                    </View>
                  </Pressable>
                  <Pressable style={styles.kindCard} onPress={() => setKind('combo')}>
                    <Text style={styles.kindEmoji}>🎉</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.kindTitle}>Compra esto, llévate esto de regalo</Text>
                      <Text style={styles.kindSubtitle}>
                        Ej. café + dona gratis
                      </Text>
                    </View>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  {!editTarget && (
                    <Pressable onPress={() => setKind(null)} hitSlop={10}>
                      <Ionicons name="arrow-back" size={20} color="#4A1B0C" />
                    </Pressable>
                  )}
                  <Text style={styles.sheetTitle}>
                    {kind === 'twoForOne' && '2x1'}
                    {kind === 'secondDiscount' && 'La segunda con descuento'}
                    {kind === 'combo' && 'Compra esto, llévate esto de regalo'}
                  </Text>
                </View>
                <ScrollView contentContainerStyle={{ gap: 10 }}>

                  {/* ---------- 2x1 y La segunda con descuento comparten: elegir producto/categoría ---------- */}
                  {(kind === 'twoForOne' || kind === 'secondDiscount') && (
                    <>
                      <Text style={styles.label}>¿Aplica a un producto o a toda una categoría?</Text>
                      <View style={styles.chipRow}>
                        {([['category', 'Categoría'], ['product', 'Producto']] as const).map(([s, label]) => (
                          <Pressable key={s}
                            style={[styles.chip, targetScope === s && styles.chipOn]}
                            onPress={() => { setTargetScope(s); setTargetId(null); }}>
                            <Text style={[styles.chipText, targetScope === s && styles.chipTextOn]}>
                              {label}
                            </Text>
                          </Pressable>
                        ))}
                      </View>

                      <Text style={styles.label}>
                        {targetScope === 'category' ? 'Elige la categoría' : 'Elige el producto'}
                      </Text>
                      {targetOptions.length > 6 && (
                        <SearchBox value={targetSearch} onChangeText={setTargetSearch}
                          placeholder={targetScope === 'category' ? 'Buscar categoría…' : 'Buscar producto…'} />
                      )}
                      <View style={styles.chipRow}>
                        {filterOptions(targetOptions, targetSearch).map((o) => (
                          <Pressable key={o.id}
                            style={[styles.chip, targetId === o.id && styles.chipOn]}
                            onPress={() => setTargetId(o.id)}>
                            <Text style={[styles.chipText, targetId === o.id && styles.chipTextOn]}>
                              {o.name}
                            </Text>
                          </Pressable>
                        ))}
                      </View>

                      <Text style={styles.label}>¿Cada cuántas unidades?</Text>
                      <View style={styles.chipRow}>
                        {[2, 3, 4].map((n) => (
                          <Pressable key={n}
                            style={[styles.chip, buyQty === n && styles.chipOn]}
                            onPress={() => setBuyQty(n)}>
                            <Text style={[styles.chipText, buyQty === n && styles.chipTextOn]}>
                              Cada {n}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </>
                  )}

                  {/* ---------- Solo "La segunda con descuento": el % ---------- */}
                  {kind === 'secondDiscount' && (
                    <>
                      <Text style={styles.label}>¿Cuánto descuento?</Text>
                      <View style={styles.chipRow}>
                        {DISCOUNT_CHIPS.map((c) => (
                          <Pressable key={c.pct}
                            style={[styles.chip, !showCustomPct && discountPct === c.pct && styles.chipOn]}
                            onPress={() => { setDiscountPct(c.pct); setShowCustomPct(false); }}>
                            <Text style={[styles.chipText, !showCustomPct && discountPct === c.pct && styles.chipTextOn]}>
                              {c.label}
                            </Text>
                          </Pressable>
                        ))}
                        <Pressable
                          style={[styles.chip, showCustomPct && styles.chipOn]}
                          onPress={() => setShowCustomPct(true)}>
                          <Text style={[styles.chipText, showCustomPct && styles.chipTextOn]}>Otro %</Text>
                        </Pressable>
                      </View>
                      {showCustomPct && (
                        <TextInput style={styles.input} placeholder="Ej. 30"
                          placeholderTextColor="#9A9A9A" keyboardType="number-pad"
                          value={customPct} onChangeText={setCustomPct} />
                      )}
                    </>
                  )}

                  {/* ---------- Solo "Combo" ---------- */}
                  {kind === 'combo' && (
                    <>
                      <Text style={styles.label}>¿Qué debe comprar el cliente?</Text>
                      {products.length > 6 && (
                        <SearchBox value={triggerSearch} onChangeText={setTriggerSearch}
                          placeholder="Buscar producto…" />
                      )}
                      <View style={styles.chipRow}>
                        {filterOptions(products, triggerSearch).map((o) => (
                          <Pressable key={o.id}
                            style={[styles.chip, triggerProductId === o.id && styles.chipOn]}
                            onPress={() => setTriggerProductId(o.id)}>
                            <Text style={[styles.chipText, triggerProductId === o.id && styles.chipTextOn]}>
                              {o.name}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                      <Text style={styles.label}>¿Cuántos debe comprar?</Text>
                      <View style={styles.chipRow}>
                        {[1, 2, 3].map((n) => (
                          <Pressable key={n}
                            style={[styles.chip, triggerQty === n && styles.chipOn]}
                            onPress={() => setTriggerQty(n)}>
                            <Text style={[styles.chipText, triggerQty === n && styles.chipTextOn]}>{n}</Text>
                          </Pressable>
                        ))}
                      </View>

                      <Text style={styles.label}>¿Qué se lleva de regalo?</Text>
                      {products.length > 6 && (
                        <SearchBox value={rewardSearch} onChangeText={setRewardSearch}
                          placeholder="Buscar producto…" />
                      )}
                      <View style={styles.chipRow}>
                        {filterOptions(products, rewardSearch).map((o) => (
                          <Pressable key={o.id}
                            style={[styles.chip, rewardProductId === o.id && styles.chipOn]}
                            onPress={() => setRewardProductId(o.id)}>
                            <Text style={[styles.chipText, rewardProductId === o.id && styles.chipTextOn]}>
                              {o.name}
                            </Text>
                          </Pressable>
                        ))}
                      </View>

                      <Text style={styles.label}>¿Gratis o con descuento?</Text>
                      <View style={styles.chipRow}>
                        <Pressable style={[styles.chip, rewardFree && styles.chipOn]}
                          onPress={() => setRewardFree(true)}>
                          <Text style={[styles.chipText, rewardFree && styles.chipTextOn]}>Gratis</Text>
                        </Pressable>
                        <Pressable style={[styles.chip, !rewardFree && styles.chipOn]}
                          onPress={() => setRewardFree(false)}>
                          <Text style={[styles.chipText, !rewardFree && styles.chipTextOn]}>Con descuento</Text>
                        </Pressable>
                      </View>
                      {!rewardFree && (
                        <View style={styles.chipRow}>
                          {DISCOUNT_CHIPS.map((c) => (
                            <Pressable key={c.pct}
                              style={[styles.chip, rewardPct === c.pct && styles.chipOn]}
                              onPress={() => setRewardPct(c.pct)}>
                              <Text style={[styles.chipText, rewardPct === c.pct && styles.chipTextOn]}>
                                {c.label}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                      )}
                    </>
                  )}

                  {/* ---------- Nombre (auto, editable) ---------- */}
                  {effectiveName ? (
                    <>
                      <Text style={styles.label}>Nombre de la promoción</Text>
                      <TextInput style={styles.input}
                        value={effectiveName}
                        onChangeText={setNameOverride} />
                    </>
                  ) : null}

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
              </>
            )}
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
  sheetTitle: { fontSize: 18, fontWeight: '700' },
  kindCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderWidth: 1.5, borderColor: '#eee', borderRadius: 14, padding: 16,
  },
  kindEmoji: { fontSize: 28 },
  kindTitle: { fontSize: 15, fontWeight: '700', color: '#222' },
  kindSubtitle: { fontSize: 12, color: '#888', marginTop: 2 },
  label: { fontSize: 12, color: '#888' },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: '#ddd', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 7, marginBottom: 2,
  },
  searchInput: { flex: 1, fontSize: 13, color: '#1F1F1F' },
  chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { borderWidth: 1, borderColor: '#ddd', borderRadius: 18, paddingVertical: 8, paddingHorizontal: 14 },
  chipOn: { borderColor: '#4A1B0C', backgroundColor: '#FAECE7' },
  chipText: { fontSize: 13, color: '#444' },
  chipTextOn: { color: '#4A1B0C', fontWeight: '600' },
  input: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10, color: '#1F1F1F',
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 15,
  },
  missing: { fontSize: 12, color: '#A32D2D' },
  saveButton: { backgroundColor: '#4A1B0C', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  saveButtonText: { color: '#FAECE7', fontSize: 15, fontWeight: '600' },
  deleteButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1, borderColor: '#A32D2D', borderRadius: 10, paddingVertical: 12, marginTop: 4,
  },
  deleteText: { color: '#A32D2D', fontWeight: '600', fontSize: 13 },
});

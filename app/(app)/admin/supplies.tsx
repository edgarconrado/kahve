import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import {
  Alert, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable,
  StyleSheet, Switch, Text, TextInput, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../lib/auth';
import { usePlan, proFeatureAlert, HIDE_PRO_UI } from '../../../lib/plan';

interface Supply {
  id: string;
  name: string;
  unit: string;
  current_stock: number;
  low_stock_threshold: number;
  cost_per_unit: number;
  is_resale: boolean;
  is_active: boolean;
}

const UNIT_SUGGESTIONS = ['g', 'kg', 'ml', 'l', 'pieza'];

export default function Supplies() {
  const { employee } = useAuth();
  const { tier } = usePlan(employee);
  const [supplies, setSupplies] = useState<Supply[]>([]);
  const [loading, setLoading] = useState(true);

  // Alta / edición de insumo
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<Supply | null>(null);
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('g');
  const [threshold, setThreshold] = useState('');
  const [isResale, setIsResale] = useState(false);
  const [saving, setSaving] = useState(false);

  // Compra / merma
  const [purchaseTarget, setPurchaseTarget] = useState<Supply | null>(null);
  const [purchaseQty, setPurchaseQty] = useState('');
  const [purchaseCost, setPurchaseCost] = useState('');
  const [wasteTarget, setWasteTarget] = useState<Supply | null>(null);
  const [wasteQty, setWasteQty] = useState('');
  const [wasteReason, setWasteReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    supabase
      .from('supplies')
      .select('*')
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => {
        setSupplies((data as Supply[]) ?? []);
        setLoading(false);
      });
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // ---- Alta / edición ----
  const openNew = () => {
    if (tier === 'free') { proFeatureAlert('El control de insumos'); return; }
    setEditTarget(null);
    setName(''); setUnit('g'); setThreshold(''); setIsResale(false);
    setShowForm(true);
  };

  const openEdit = (s: Supply) => {
    setEditTarget(s);
    setName(s.name); setUnit(s.unit);
    setThreshold(String(s.low_stock_threshold)); setIsResale(s.is_resale);
    setShowForm(true);
  };

  const missing = [
    !name.trim() && 'nombre',
    !unit.trim() && 'unidad',
  ].filter(Boolean) as string[];

  const saveSupply = async () => {
    if (missing.length > 0 || !employee) return;
    setSaving(true);
    const payload = {
      name: name.trim(),
      unit: unit.trim(),
      low_stock_threshold: parseFloat(threshold) || 0,
      is_resale: isResale,
    };
    const { error } = editTarget
      ? await supabase.from('supplies').update(payload).eq('id', editTarget.id)
      : await supabase.from('supplies').insert({
          ...payload,
          organization_id: employee.organization_id,
        });
    setSaving(false);
    if (error) { Alert.alert('Error', error.message); return; }
    setShowForm(false);
    load();
  };

  const deactivate = (s: Supply) => {
    Alert.alert(`Desactivar "${s.name}"`,
      'Ya no aparecerá en la lista ni en nuevas recetas. El historial se conserva.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Desactivar', style: 'destructive',
          onPress: async () => {
            await supabase.from('supplies').update({ is_active: false }).eq('id', s.id);
            setShowForm(false);
            load();
          },
        },
      ]);
  };

  // ---- Compra ----
  const confirmPurchase = async () => {
    if (!purchaseTarget) return;
    const qty = parseFloat(purchaseQty);
    const cost = parseFloat(purchaseCost);
    if (!qty || qty <= 0 || cost === undefined || isNaN(cost) || cost < 0) {
      Alert.alert('Datos incompletos', 'Indica cantidad y costo total válidos.');
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc('register_supply_purchase', {
      p_supply_id: purchaseTarget.id,
      p_quantity: qty,
      p_total_cost: cost,
      p_notes: null,
    });
    setBusy(false);
    if (error) { Alert.alert('Error', error.message); return; }
    setPurchaseTarget(null); setPurchaseQty(''); setPurchaseCost('');
    load();
  };

  // ---- Merma ----
  const confirmWaste = async () => {
    if (!wasteTarget) return;
    const qty = parseFloat(wasteQty);
    if (!qty || qty <= 0 || !wasteReason.trim()) {
      Alert.alert('Datos incompletos', 'Indica cantidad y motivo.');
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc('register_supply_waste', {
      p_supply_id: wasteTarget.id,
      p_quantity: qty,
      p_reason: wasteReason.trim(),
    });
    setBusy(false);
    if (error) { Alert.alert('Error', error.message); return; }
    setWasteTarget(null); setWasteQty(''); setWasteReason('');
    load();
  };

  const lowStockCount = supplies.filter((s) => s.current_stock <= s.low_stock_threshold).length;

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable onPress={() => router.push('/(app)/admin')} hitSlop={12}>
            <Ionicons name="arrow-back" size={22} color="#4A1B0C" />
          </Pressable>
          <Text style={styles.title}>Insumos</Text>
        </View>
        {lowStockCount > 0 && (
          <View style={styles.alertPill}>
            <Ionicons name="warning-outline" size={13} color="#854F0B" />
            <Text style={styles.alertPillText}>
              {lowStockCount} con stock bajo
            </Text>
          </View>
        )}
      </View>

      {tier === 'free' ? (
        <View style={styles.lockedBox}>
          <Ionicons name="lock-closed-outline" size={28} color="#bbb" />
          <Text style={styles.lockedTitle}>
            {HIDE_PRO_UI ? 'No disponible' : 'Función de Kahve Pro'}
          </Text>
          <Text style={styles.lockedText}>
            {HIDE_PRO_UI
              ? 'El control de insumos no está disponible en esta versión.'
              : 'El control de insumos, recetas y mermas está disponible en el plan Pro.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={supplies}
          keyExtractor={(s) => s.id}
          refreshing={loading}
          onRefresh={load}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 100 }}
          ListEmptyComponent={
            !loading ? (
              <Text style={styles.empty}>
                Aún no tienes insumos. Agrega el primero con el botón +.
              </Text>
            ) : null
          }
          renderItem={({ item }) => {
            const low = item.current_stock <= item.low_stock_threshold;
            return (
              <Pressable style={[styles.card, low && styles.cardLow]} onPress={() => openEdit(item)}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.name}>{item.name}</Text>
                    {item.is_resale && (
                      <View style={styles.resaleTag}>
                        <Text style={styles.resaleTagText}>reventa</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.stock, low && { color: '#A32D2D', fontWeight: '700' }]}>
                    {item.current_stock.toLocaleString('es-MX')} {item.unit} en existencia
                    {low ? ' · ¡bajo!' : ''}
                  </Text>
                  <Text style={styles.cost}>
                    Costo: ${item.cost_per_unit.toFixed(2)} / {item.unit}
                  </Text>
                </View>
                <View style={{ gap: 8, alignItems: 'flex-end' }}>
                  <Pressable style={styles.miniButton}
                    onPress={() => { setPurchaseTarget(item); setPurchaseQty(''); setPurchaseCost(''); }}>
                    <Ionicons name="add-circle-outline" size={14} color="#0F6E56" />
                    <Text style={[styles.miniButtonText, { color: '#0F6E56' }]}>Compra</Text>
                  </Pressable>
                  <Pressable style={styles.miniButton}
                    onPress={() => { setWasteTarget(item); setWasteQty(''); setWasteReason(''); }}>
                    <Ionicons name="trash-outline" size={14} color="#A32D2D" />
                    <Text style={[styles.miniButtonText, { color: '#A32D2D' }]}>Merma</Text>
                  </Pressable>
                </View>
              </Pressable>
            );
          }}
        />
      )}

      {tier !== 'free' && (
        <Pressable style={styles.fab} onPress={openNew}>
          <Ionicons name="add" size={26} color="#FAECE7" />
        </Pressable>
      )}

      {/* ---- Modal: alta / edición de insumo ---- */}
      <Modal visible={showForm} transparent animationType="slide" onRequestClose={() => setShowForm(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable style={styles.backdrop} onPress={() => setShowForm(false)} />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>
              {editTarget ? 'Editar insumo' : 'Nuevo insumo'}
            </Text>
            <TextInput style={styles.input} placeholder="Nombre (ej. Café en grano)"
              placeholderTextColor="#9A9A9A" value={name} onChangeText={setName} />

            <Text style={styles.label}>Unidad de medida</Text>
            <View style={styles.chipRow}>
              {UNIT_SUGGESTIONS.map((u) => (
                <Pressable key={u} style={[styles.chip, unit === u && styles.chipOn]} onPress={() => setUnit(u)}>
                  <Text style={[styles.chipText, unit === u && styles.chipTextOn]}>{u}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput style={styles.input} placeholder="...o escribe otra unidad"
              placeholderTextColor="#9A9A9A" value={unit} onChangeText={setUnit} />

            <TextInput style={styles.input} placeholder="Avisar cuando quede menos de (opcional)"
              placeholderTextColor="#9A9A9A" keyboardType="decimal-pad"
              value={threshold} onChangeText={setThreshold} />

            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.switchLabel}>Se compra ya hecho (reventa)</Text>
                <Text style={styles.switchHint}>
                  Ej. galletas de proveedor: no se prepara, se revende tal cual.
                </Text>
              </View>
              <Switch value={isResale} onValueChange={setIsResale} />
            </View>

            {missing.length > 0 && (
              <Text style={styles.missing}>Falta: {missing.join(', ')}</Text>
            )}

            <Pressable style={[styles.saveButton, (saving || missing.length > 0) && { opacity: 0.5 }]}
              disabled={saving || missing.length > 0} onPress={saveSupply}>
              <Text style={styles.saveButtonText}>
                {saving ? 'Guardando…' : editTarget ? 'Guardar cambios' : 'Crear insumo'}
              </Text>
            </Pressable>

            {editTarget && (
              <Pressable style={styles.deactivateButton} onPress={() => deactivate(editTarget)}>
                <Ionicons name="archive-outline" size={15} color="#A32D2D" />
                <Text style={styles.deactivateText}>Desactivar insumo</Text>
              </Pressable>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ---- Modal: registrar compra ---- */}
      <Modal visible={purchaseTarget !== null} transparent animationType="slide"
        onRequestClose={() => setPurchaseTarget(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable style={styles.backdrop} onPress={() => setPurchaseTarget(null)} />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Registrar compra</Text>
            <Text style={styles.sheetSub}>{purchaseTarget?.name}</Text>
            <TextInput style={styles.input} placeholder={`Cantidad comprada (${purchaseTarget?.unit ?? ''})`}
              placeholderTextColor="#9A9A9A" keyboardType="decimal-pad"
              value={purchaseQty} onChangeText={setPurchaseQty} />
            <TextInput style={styles.input} placeholder="Costo total pagado ($)"
              placeholderTextColor="#9A9A9A" keyboardType="decimal-pad"
              value={purchaseCost} onChangeText={setPurchaseCost} />
            <Text style={styles.hint}>
              El costo por {purchaseTarget?.unit} se recalcula automáticamente como
              promedio con tu stock actual.
            </Text>
            <Pressable style={[styles.saveButton, busy && { opacity: 0.6 }]} disabled={busy} onPress={confirmPurchase}>
              <Text style={styles.saveButtonText}>{busy ? 'Registrando…' : 'Registrar compra'}</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ---- Modal: registrar merma ---- */}
      <Modal visible={wasteTarget !== null} transparent animationType="slide"
        onRequestClose={() => setWasteTarget(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable style={styles.backdrop} onPress={() => setWasteTarget(null)} />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Registrar merma</Text>
            <Text style={styles.sheetSub}>{wasteTarget?.name}</Text>
            <TextInput style={styles.input} placeholder={`Cantidad perdida (${wasteTarget?.unit ?? ''})`}
              placeholderTextColor="#9A9A9A" keyboardType="decimal-pad"
              value={wasteQty} onChangeText={setWasteQty} />
            <TextInput style={styles.input} placeholder="Motivo (ej. se echó a perder, se rompió)"
              placeholderTextColor="#9A9A9A" value={wasteReason} onChangeText={setWasteReason} />
            <Pressable style={[styles.wasteButton, busy && { opacity: 0.6 }]} disabled={busy} onPress={confirmWaste}>
              <Text style={styles.saveButtonText}>{busy ? 'Registrando…' : 'Registrar merma'}</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 54, paddingBottom: 14,
  },
  title: { fontSize: 24, fontWeight: '700', color: '#222' },
  alertPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#FAEEDA', borderRadius: 14, paddingVertical: 5, paddingHorizontal: 10,
  },
  alertPillText: { fontSize: 11.5, color: '#854F0B', fontWeight: '700' },
  empty: { textAlign: 'center', color: '#999', fontSize: 13, marginTop: 40 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderColor: '#eee', borderRadius: 14, padding: 14,
  },
  cardLow: { borderColor: '#F3D4A0', backgroundColor: '#FFFBF2' },
  name: { fontSize: 15, fontWeight: '700', color: '#222' },
  resaleTag: { backgroundColor: '#EEEDFE', borderRadius: 8, paddingVertical: 1, paddingHorizontal: 7 },
  resaleTagText: { fontSize: 9.5, color: '#534AB7', fontWeight: '700' },
  stock: { fontSize: 12.5, color: '#555', marginTop: 3 },
  cost: { fontSize: 11, color: '#999', marginTop: 2 },
  miniButton: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  miniButtonText: { fontSize: 11.5, fontWeight: '600' },
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
    padding: 20, paddingBottom: 32, gap: 10,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700' },
  sheetSub: { fontSize: 13, color: '#888', marginTop: -6 },
  label: { fontSize: 12, color: '#888', marginTop: 4 },
  chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { borderWidth: 1, borderColor: '#ddd', borderRadius: 18, paddingVertical: 7, paddingHorizontal: 14 },
  chipOn: { borderColor: '#4A1B0C', backgroundColor: '#FAECE7' },
  chipText: { fontSize: 13, color: '#444' },
  chipTextOn: { color: '#4A1B0C', fontWeight: '600' },
  input: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10, color: '#1F1F1F',
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 15,
  },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  switchLabel: { fontSize: 13.5, color: '#333', fontWeight: '600' },
  switchHint: { fontSize: 11.5, color: '#999', marginTop: 2 },
  missing: { fontSize: 12, color: '#A32D2D' },
  saveButton: { backgroundColor: '#4A1B0C', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  saveButtonText: { color: '#FAECE7', fontSize: 15, fontWeight: '600' },
  wasteButton: { backgroundColor: '#A32D2D', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  deactivateButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1, borderColor: '#A32D2D', borderRadius: 10, paddingVertical: 12, marginTop: 4,
  },
  deactivateText: { color: '#A32D2D', fontWeight: '600', fontSize: 13 },
  hint: { fontSize: 11.5, color: '#999', lineHeight: 16 },
});

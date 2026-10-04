import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import {
  Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView,
  StyleSheet, Switch, Text, TextInput, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../lib/auth';
import { usePlan, proFeatureAlert, HIDE_PRO_UI } from '../../../lib/plan';
import HeaderLogo from '../../../components/HeaderLogo';

interface Option { id: string; name: string }
const DISCOUNT_CHIPS = [
  { pct: 25, label: '25% menos' },
  { pct: 50, label: 'Mitad de precio' },
  { pct: 75, label: '75% menos' },
];

// Mismo patrón que en Promociones: componente fuera del padre, o el
// teclado se cierra en cada letra al escribir en la búsqueda.
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

export default function Loyalty() {
  const { employee } = useAuth();
  const { tier } = usePlan(employee);

  const [branches, setBranches] = useState<Option[]>([]);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [products, setProducts] = useState<Option[]>([]);
  const [productSearch, setProductSearch] = useState('');

  const [loading, setLoading] = useState(true);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [visitsRequired, setVisitsRequired] = useState('10');
  const [rewardProductId, setRewardProductId] = useState<string | null>(null);
  const [rewardFree, setRewardFree] = useState(true);
  const [rewardPct, setRewardPct] = useState(50);
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadProgram = useCallback(async (bId: string) => {
    const { data } = await supabase
      .from('loyalty_programs').select('*').eq('branch_id', bId).maybeSingle();
    if (data) {
      setExistingId(data.id);
      setVisitsRequired(String(data.visits_required));
      setRewardProductId(data.reward_product_id);
      setRewardFree(data.discount_percent >= 100);
      setRewardPct(data.discount_percent >= 100 ? 50 : data.discount_percent);
      setIsActive(data.is_active);
    } else {
      setExistingId(null);
      setVisitsRequired('10'); setRewardProductId(null);
      setRewardFree(true); setRewardPct(50); setIsActive(true);
    }
  }, []);

  const load = useCallback(() => {
    if (!employee) return;
    setLoading(true);
    supabase.from('products').select('id, name').eq('is_active', true).order('name')
      .then(({ data }) => setProducts(data ?? []));
    supabase.from('branches').select('id, name').eq('organization_id', employee.organization_id)
      .eq('is_active', true).order('name')
      .then(async ({ data }) => {
        const list = data ?? [];
        setBranches(list);
        const defaultBranch = employee.branch_id ?? list[0]?.id ?? null;
        setBranchId(defaultBranch);
        if (defaultBranch) await loadProgram(defaultBranch);
        setLoading(false);
      });
  }, [employee, loadProgram]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filteredProducts = productSearch.trim()
    ? products.filter((p) => p.name.toLowerCase().includes(productSearch.trim().toLowerCase()))
    : products;

  const missing = (() => {
    const errs: string[] = [];
    if (!branchId) errs.push('sucursal');
    if ((parseInt(visitsRequired) || 0) < 2) errs.push('cantidad mínima de 2 visitas');
    if (!rewardProductId) errs.push('el producto de premio');
    return errs;
  })();

  const save = async () => {
    if (missing.length > 0 || !employee || !branchId) return;
    setSaving(true);
    const payload = {
      organization_id: employee.organization_id,
      branch_id: branchId,
      visits_required: parseInt(visitsRequired),
      reward_product_id: rewardProductId,
      discount_percent: rewardFree ? 100 : rewardPct,
      is_active: isActive,
    };
    const { error } = existingId
      ? await supabase.from('loyalty_programs').update(payload).eq('id', existingId)
      : await supabase.from('loyalty_programs').insert(payload);
    setSaving(false);
    if (error) { Alert.alert('Error', error.message); return; }
    Alert.alert('Guardado', 'Tu programa de clientes frecuentes está listo.');
    load();
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable onPress={() => router.push('/(app)/admin')} hitSlop={12}>
            <Ionicons name="arrow-back" size={22} color="#F5C4B3" />
          </Pressable>
          <Ionicons name="heart-outline" size={20} color="#F5C4B3" />
          <Text style={styles.title}>Clientes frecuentes</Text>
        </View>
        <HeaderLogo />
      </View>

      {tier === 'free' ? (
        <View style={styles.lockedBox}>
          <Ionicons name="lock-closed-outline" size={28} color="#bbb" />
          <Text style={styles.lockedTitle}>
            {HIDE_PRO_UI ? 'No disponible' : 'Función de Kahve Pro'}
          </Text>
          <Text style={styles.lockedText}>
            {HIDE_PRO_UI
              ? 'El programa de clientes frecuentes no está disponible en esta versión.'
              : 'El programa de clientes frecuentes está disponible en el plan Pro.'}
          </Text>
        </View>
      ) : loading ? (
        <Text style={styles.empty}>Cargando…</Text>
      ) : (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
            <Text style={styles.hint}>
              Premia a los clientes que regresan seguido: cada cierto número
              de visitas, se lleva un producto gratis o con descuento.
              Se activa solo al cobrar, cuando el cajero teclea su teléfono.
            </Text>

            {branches.length > 1 && (
              <>
                <Text style={styles.label}>Sucursal</Text>
                <View style={styles.chipRow}>
                  {branches.map((b) => (
                    <Pressable key={b.id}
                      style={[styles.chip, branchId === b.id && styles.chipOn]}
                      onPress={() => { setBranchId(b.id); loadProgram(b.id); }}>
                      <Text style={[styles.chipText, branchId === b.id && styles.chipTextOn]}>
                        {b.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}

            <Text style={styles.label}>¿Cada cuántas visitas se gana el premio?</Text>
            <View style={styles.chipRow}>
              {[5, 10, 15].map((n) => (
                <Pressable key={n}
                  style={[styles.chip, visitsRequired === String(n) && styles.chipOn]}
                  onPress={() => setVisitsRequired(String(n))}>
                  <Text style={[styles.chipText, visitsRequired === String(n) && styles.chipTextOn]}>
                    Cada {n}
                  </Text>
                </Pressable>
              ))}
            </View>
            <TextInput style={styles.input} placeholder="Otro número (ej. 8)"
              placeholderTextColor="#9A9A9A" keyboardType="number-pad"
              value={visitsRequired} onChangeText={setVisitsRequired} />

            <Text style={styles.label}>¿Qué producto se lleva de premio?</Text>
            {products.length > 6 && (
              <SearchBox value={productSearch} onChangeText={setProductSearch}
                placeholder="Buscar producto…" />
            )}
            <View style={styles.chipRow}>
              {filteredProducts.map((o) => (
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

            <View style={styles.activeRow}>
              <Text style={styles.label}>Programa activo</Text>
              <Switch value={isActive} onValueChange={setIsActive} trackColor={{ true: '#1D9E75' }} />
            </View>

            {missing.length > 0 && (
              <Text style={styles.missing}>Falta: {missing.join(', ')}</Text>
            )}

            <Pressable style={[styles.saveButton, (saving || missing.length > 0) && { opacity: 0.5 }]}
              disabled={saving || missing.length > 0} onPress={save}>
              <Text style={styles.saveButtonText}>
                {saving ? 'Guardando…' : 'Guardar'}
              </Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 54, paddingBottom: 14,
    backgroundColor: '#4A1B0C',
  },
  title: { fontSize: 24, fontWeight: '700', color: '#FAECE7' },
  empty: { textAlign: 'center', color: '#999', fontSize: 13, marginTop: 40 },
  hint: { fontSize: 12.5, color: '#666', lineHeight: 18, backgroundColor: '#FAECE7', padding: 10, borderRadius: 10 },
  lockedBox: { alignItems: 'center', paddingTop: 90, paddingHorizontal: 40, gap: 8 },
  lockedTitle: { fontSize: 15, fontWeight: '700', color: '#666', marginTop: 4 },
  lockedText: { fontSize: 13, color: '#999', textAlign: 'center', lineHeight: 19 },
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
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: '#ddd', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 7,
  },
  searchInput: { flex: 1, fontSize: 13, color: '#1F1F1F' },
  activeRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 4,
  },
  missing: { fontSize: 12, color: '#A32D2D' },
  saveButton: { backgroundColor: '#4A1B0C', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  saveButtonText: { color: '#FAECE7', fontSize: 15, fontWeight: '600' },
});

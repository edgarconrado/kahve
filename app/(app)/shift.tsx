import { useCallback, useMemo, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import {
  Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View, KeyboardAvoidingView, Platform, Modal, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { useOpenShift } from '../../lib/shift';

// Denominaciones mexicanas para el conteo del corte
const BILLS = [1000, 500, 200, 100, 50, 20] as const;

export default function ShiftScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= 700;
  const { employee } = useAuth();
  const { shift, refresh } = useOpenShift(employee);
  const [openingCash, setOpeningCash] = useState('500');
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [coins, setCoins] = useState('');
  const [busy, setBusy] = useState(false);
  const [byMethod, setByMethod] = useState<Record<string, number>>({});
  const [expectedCash, setExpectedCash] = useState<number | null>(null);
  const [movements, setMovements] = useState<
    { id: string; type: 'retiro' | 'deposito'; amount: number; reason: string }[]
  >([]);
  const [showMovement, setShowMovement] = useState(false);
  const [movType, setMovType] = useState<'retiro' | 'deposito'>('retiro');
  const [movAmount, setMovAmount] = useState('');
  const [movReason, setMovReason] = useState('');

  useFocusEffect(
    useCallback(() => {
      if (!shift) { setByMethod({}); setExpectedCash(null); return; }
      Promise.all([
        supabase
          .from('payments')
          .select('amount, tip, method, card_type, orders(status)')
          .eq('shift_id', shift.id),
        supabase
          .from('cash_movements')
          .select('id, type, amount, reason')
          .eq('shift_id', shift.id)
          .order('created_at'),
      ]).then(([{ data: pays }, { data: movs }]) => {
        const totals: Record<string, number> = {};
        let cash = 0;
        let cashTips = 0;
        let cardTips = 0;
        (pays ?? []).forEach((p: any) => {
          if (p.orders?.status === 'cancelada') return;
          const key = p.method === 'tarjeta' ? `tarjeta-${p.card_type}` : p.method;
          totals[key] = (totals[key] ?? 0) + Number(p.amount);
          if (p.method === 'efectivo') {
            cash += Number(p.amount);
            cashTips += Number(p.tip ?? 0);
          } else {
            cardTips += Number(p.tip ?? 0);
          }
        });
        if (cashTips > 0) totals['propinas-efectivo'] = cashTips;
        if (cardTips > 0) totals['propinas-otros'] = cardTips;
        setByMethod(totals);
        setMovements((movs as any[]) ?? []);
        // Esperado = fondo + ventas efectivo + depósitos − retiros
        const movNet = (movs ?? []).reduce((a: number, m: any) =>
          a + (m.type === 'deposito' ? Number(m.amount) : -Number(m.amount)), 0);
        setExpectedCash(
          +(Number(shift.opening_cash) + cash + cashTips + movNet).toFixed(2),
        );
      });
    }, [shift?.id]),
  );

  const saveMovement = async () => {
    if (!shift || !employee) return;
    const amount = parseFloat(movAmount);
    if (!amount || amount <= 0 || !movReason.trim()) {
      Alert.alert('Datos incompletos', 'Indica el monto y el motivo del movimiento.');
      return;
    }
    const { error } = await supabase.from('cash_movements').insert({
      organization_id: employee.organization_id,
      shift_id: shift.id,
      employee_id: employee.id,
      type: movType,
      amount,
      reason: movReason.trim(),
    });
    if (error) { Alert.alert('Error', error.message); return; }
    setShowMovement(false);
    setMovAmount(''); setMovReason(''); setMovType('retiro');
    refresh(); // dispara la recarga de finanzas vía el focus effect… no: recargar directo
    // Recarga directa de movimientos y esperado:
    const { data: movs } = await supabase
      .from('cash_movements')
      .select('id, type, amount, reason')
      .eq('shift_id', shift.id)
      .order('created_at');
    setMovements((movs as any[]) ?? []);
    const cash = Object.entries(byMethod)
      .filter(([k]) => k === 'efectivo')
      .reduce((a, [, v]) => a + v, 0);
    const movNet = (movs ?? []).reduce((a: number, m: any) =>
      a + (m.type === 'deposito' ? Number(m.amount) : -Number(m.amount)), 0);
    setExpectedCash(+(Number(shift.opening_cash) + cash + movNet).toFixed(2));
  };

  const countedCash = useMemo(() => {
    const bills = BILLS.reduce(
      (sum, d) => sum + d * (parseInt(counts[d] ?? '0', 10) || 0),
      0,
    );
    return +(bills + (parseFloat(coins) || 0)).toFixed(2);
  }, [counts, coins]);

  const setCount = (denomination: number, value: string) =>
    setCounts((c) => ({ ...c, [denomination]: value.replace(/[^0-9]/g, '') }));

  // Botones +/− para contar billetes sin teclear
  const stepCount = (denomination: number, delta: number) =>
    setCounts((c) => {
      const current = parseInt(c[denomination] ?? '0', 10) || 0;
      const next = Math.max(0, Math.min(999, current + delta));
      return { ...c, [denomination]: next === 0 ? '' : String(next) };
    });

  // Teclado numérico para el total de monedas
  const [showCoinPad, setShowCoinPad] = useState(false);
  const [coinDraft, setCoinDraft] = useState('');

  const coinPadPress = (key: string) => {
    setCoinDraft((d) => {
      if (key === '⌫') return d.slice(0, -1);
      if (key === '.') return d.includes('.') || d === '' ? d : d + '.';
      // dígito: máximo 2 decimales y 6 enteros
      const [ints = '', decs] = d.split('.');
      if (decs !== undefined && decs.length >= 2) return d;
      if (decs === undefined && ints.length >= 6) return d;
      return d + key;
    });
  };

  const openShift = async () => {
    if (!employee) return;
    // El admin sin sucursal asignada abre en la primera sucursal de su org.
    // TODO: selector de sucursal para organizaciones multi-sucursal.
    let branchId = employee.branch_id;
    if (!branchId) {
      const { data } = await supabase
        .from('branches')
        .select('id')
        .eq('is_active', true)
        .limit(1)
        .single();
      branchId = data?.id ?? null;
    }
    if (!branchId) {
      Alert.alert('Sin sucursal', 'No hay sucursales activas en tu organización.');
      return;
    }

    setBusy(true);
    const { error } = await supabase.from('shifts').insert({
      organization_id: employee.organization_id,
      branch_id: branchId,
      employee_id: employee.id,
      opening_cash: parseFloat(openingCash) || 0,
    });
    setBusy(false);
    if (error) {
      Alert.alert('Error', 'No se pudo abrir el turno.');
      return;
    }
    await refresh();
    router.back();
  };

  const TOLERANCE = 10; // pesos de diferencia aceptable sin autorización

  const closeShift = async () => {
    if (!shift || expectedCash === null) return;

    const expected = expectedCash;
    const difference = +(countedCash - expected).toFixed(2);
    const outOfTolerance = Math.abs(difference) > TOLERANCE;

    // Fuera de tolerancia: solo supervisor o admin pueden autorizar el cierre
    if (outOfTolerance && employee?.role !== 'supervisor' && employee?.role !== 'admin') {
      Alert.alert(
        'Autorización requerida',
        `La diferencia ($${Math.abs(difference).toFixed(2)}) excede la tolerancia de $${TOLERANCE}. ` +
        'Pide a un supervisor que revise el conteo y cierre el turno.',
      );
      return;
    }
    setBusy(true);

    // Desglose por denominación para auditoría posterior
    const denominations: Record<string, number> = {};
    BILLS.forEach((d) => {
      const n = parseInt(counts[d] ?? '0', 10) || 0;
      if (n > 0) denominations[String(d)] = n;
    });
    if (parseFloat(coins) > 0) denominations.coins = parseFloat(coins);

    const { error } = await supabase
      .from('shifts')
      .update({
        status: 'cerrado',
        expected_cash: expected,
        counted_cash: countedCash,
        cash_difference: difference,
        denominations,
        approved_by: outOfTolerance ? employee?.id : null,
        closed_at: new Date().toISOString(),
      })
      .eq('id', shift.id);

    setBusy(false);
    if (error) {
      Alert.alert('Error', 'No se pudo cerrar el turno.');
      return;
    }
    await refresh();
    const sign = difference > 0 ? 'sobrante' : difference < 0 ? 'faltante' : 'exacto';
    Alert.alert(
      'Turno cerrado',
      `Esperado: $${expected.toFixed(2)}\nContado: $${countedCash.toFixed(2)}\n` +
      `Diferencia: $${Math.abs(difference).toFixed(2)} (${sign})`,
    );
    router.back();
  };

  if (!shift) {
    return (
      <ScrollView contentContainerStyle={[styles.container, isWide && styles.containerWide]}>
        <Text style={styles.title}>Abrir turno</Text>
        <Text style={styles.label}>Fondo de caja inicial</Text>
        <TextInput placeholderTextColor="#9A9A9A"
          style={styles.input}
          keyboardType="decimal-pad"
          value={openingCash}
          onChangeText={setOpeningCash}
        />
        <Pressable
          style={[styles.button, busy && { opacity: 0.6 }]}
          disabled={busy}
          onPress={openShift}
        >
          <Text style={styles.buttonText}>{busy ? 'Abriendo…' : 'Abrir turno'}</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1 }}
      keyboardVerticalOffset={90}
    >
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[styles.container, isWide && styles.containerWide]}>
      <Text style={styles.title}>Cerrar turno</Text>
      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          Turno abierto desde {new Date(shift.opened_at).toLocaleTimeString('es-MX', {
            hour: '2-digit', minute: '2-digit',
          })}
        </Text>
        <Text style={styles.infoText}>
          Fondo inicial: ${Number(shift.opening_cash).toFixed(2)}
        </Text>
      </View>

      <Text style={styles.label}>Conteo de efectivo</Text>
      {BILLS.map((d) => {
        const qty = parseInt(counts[d] ?? '0', 10) || 0;
        return (
          <View key={d} style={styles.denomRow}>
            <Text style={styles.denomLabel}>${d}</Text>
            <Pressable style={styles.stepButton} hitSlop={6}
              onPress={() => stepCount(d, -1)}>
              <Ionicons name="remove" size={20} color="#4A1B0C" />
            </Pressable>
            <TextInput placeholderTextColor="#9A9A9A"
              style={styles.denomInput}
              keyboardType="number-pad"
              placeholder="0"
              maxLength={3}
              value={counts[d] ?? ''}
              onChangeText={(v) => setCount(d, v)}
            />
            <Pressable style={styles.stepButton} hitSlop={6}
              onPress={() => stepCount(d, 1)}>
              <Ionicons name="add" size={20} color="#4A1B0C" />
            </Pressable>
            <Text style={styles.denomSubtotal}>
              {qty > 0 ? `$${(d * qty).toLocaleString('es-MX')}` : '—'}
            </Text>
          </View>
        );
      })}
      <View style={styles.denomRow}>
        <Text style={styles.denomLabel}>Monedas</Text>
        <Pressable
          style={styles.coinButton}
          onPress={() => { setCoinDraft(coins); setShowCoinPad(true); }}
        >
          <Ionicons name="calculator-outline" size={16} color="#4A1B0C" />
          <Text style={[styles.coinButtonText, !coins && { color: '#999' }]}>
            {coins ? `$${parseFloat(coins).toFixed(2)}` : 'Capturar total en monedas'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.totalBox}>
        <Text style={styles.totalLabel}>Efectivo contado</Text>
        <Text style={styles.totalValue}>${countedCash.toFixed(2)}</Text>
      </View>
      <Text style={styles.hint}>
        Incluye fondo de caja inicial: ${Number(shift.opening_cash).toFixed(2)}
      </Text>

      {/* Ventas del turno por método (como el mockup) */}
      <Text style={styles.label}>Ventas del turno por método</Text>
      <View style={styles.methodBox}>
        {[
          ['efectivo', 'Efectivo', 'cash-outline'],
          ['tarjeta-debito', 'Tarjeta débito', 'card-outline'],
          ['tarjeta-credito', 'Tarjeta crédito', 'card-outline'],
          ['transferencia', 'Transferencia', 'business-outline'],
          ['propinas-efectivo', 'Propinas en efectivo', 'heart-outline'],
          ['propinas-otros', 'Propinas tarjeta/transf.', 'heart-outline'],
        ].filter(([key]) =>
          !key.startsWith('propinas') || (byMethod[key] ?? 0) > 0,
        ).map(([key, label, icon]) => (
          <View key={key} style={styles.methodRow}>
            <Ionicons name={icon as any} size={15} color="#777" />
            <Text style={styles.methodLabel}>{label}</Text>
            <Text style={styles.methodValue}>
              ${(byMethod[key] ?? 0).toFixed(2)}
            </Text>
          </View>
        ))}
      </View>

      {/* Movimientos de caja del turno */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
        <Text style={[styles.label, { flex: 1, marginTop: 0 }]}>
          Movimientos de caja
        </Text>
        <Pressable onPress={() => setShowMovement(true)} hitSlop={8}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name="add-circle-outline" size={16} color="#4A1B0C" />
          <Text style={{ fontSize: 12, color: '#4A1B0C', fontWeight: '600' }}>
            Registrar
          </Text>
        </Pressable>
      </View>
      {movements.length === 0 ? (
        <Text style={{ fontSize: 12, color: '#999' }}>
          Sin retiros ni depósitos en este turno.
        </Text>
      ) : (
        <View style={styles.methodBox}>
          {movements.map((m) => (
            <View key={m.id} style={styles.methodRow}>
              <Ionicons
                name={m.type === 'retiro' ? 'arrow-up-circle-outline' : 'arrow-down-circle-outline'}
                size={15}
                color={m.type === 'retiro' ? '#A32D2D' : '#0F6E56'}
              />
              <Text style={styles.methodLabel} numberOfLines={1}>{m.reason}</Text>
              <Text style={[styles.methodValue,
                { color: m.type === 'retiro' ? '#A32D2D' : '#0F6E56' }]}>
                {m.type === 'retiro' ? '−' : '+'}${Number(m.amount).toFixed(2)}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Esperado vs contado vs diferencia */}
      {expectedCash !== null && (() => {
        const diff = +(countedCash - expectedCash).toFixed(2);
        const outOfTolerance = countedCash > 0 && Math.abs(diff) > 10;
        return (
          <>
            <View style={styles.compareBox}>
              <View style={styles.compareRow}>
                <Text style={styles.compareLabel}>Efectivo esperado</Text>
                <Text style={styles.compareValue}>${expectedCash.toFixed(2)}</Text>
              </View>
              <View style={styles.compareRow}>
                <Text style={styles.compareLabel}>Efectivo contado</Text>
                <Text style={styles.compareValue}>${countedCash.toFixed(2)}</Text>
              </View>
              <View style={[styles.compareRow, styles.compareDiffRow]}>
                <Text style={[styles.compareDiff,
                  { color: diff < 0 ? '#A32D2D' : diff > 0 ? '#854F0B' : '#3B6D11' }]}>
                  Diferencia
                </Text>
                <Text style={[styles.compareDiff,
                  { color: diff < 0 ? '#A32D2D' : diff > 0 ? '#854F0B' : '#3B6D11' }]}>
                  {diff === 0 ? 'Exacto'
                    : `${diff > 0 ? '+' : '-'}$${Math.abs(diff).toFixed(2)}`}
                </Text>
              </View>
            </View>

            {outOfTolerance && (
              <View style={styles.toleranceBox}>
                <Ionicons name="warning-outline" size={15} color="#854F0B" />
                <Text style={styles.toleranceText}>
                  Diferencia fuera de tolerancia ($10). Requiere autorización
                  de supervisor.
                </Text>
              </View>
            )}
          </>
        );
      })()}

      <Pressable
        style={[styles.button, (busy || countedCash === 0) && { opacity: 0.6 }]}
        disabled={busy || countedCash === 0}
        onPress={closeShift}
      >
        <Text style={styles.buttonText}>
          {busy ? 'Cerrando…' : 'Cerrar turno y enviar corte'}
        </Text>
      </Pressable>

      <Modal visible={showCoinPad} transparent animationType="slide"
        onRequestClose={() => setShowCoinPad(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable style={styles.backdrop} onPress={() => setShowCoinPad(false)} />
          <View style={styles.coinPadSheet}>
            <Text style={styles.movementTitle}>Total en monedas</Text>
            <View style={styles.coinDisplay}>
              <Text style={styles.coinDisplayText}>
                ${coinDraft || '0'}
              </Text>
            </View>
            <View style={styles.padGrid}>
              {['1','2','3','4','5','6','7','8','9','.','0','⌫'].map((k) => (
                <Pressable key={k} style={styles.padKey}
                  onPress={() => coinPadPress(k)}>
                  {k === '⌫'
                    ? <Ionicons name="backspace-outline" size={24} color="#4A1B0C" />
                    : <Text style={styles.padKeyText}>{k}</Text>}
                </Pressable>
              ))}
            </View>
            <Pressable
              style={styles.button}
              onPress={() => {
                const value = parseFloat(coinDraft);
                setCoins(value > 0 ? String(value) : '');
                setShowCoinPad(false);
              }}
            >
              <Text style={styles.buttonText}>
                Confirmar ${coinDraft ? (parseFloat(coinDraft) || 0).toFixed(2) : '0.00'}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={showMovement} transparent animationType="slide"
        onRequestClose={() => setShowMovement(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1, justifyContent: 'flex-end' }}
        >
          <Pressable style={styles.backdrop} onPress={() => setShowMovement(false)} />
          <View style={styles.movementSheet}>
            <Text style={styles.movementTitle}>Movimiento de caja</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable
                style={[styles.movChip, movType === 'retiro' && styles.movChipRetiro]}
                onPress={() => setMovType('retiro')}>
                <Text style={[styles.movChipText,
                  movType === 'retiro' && { color: '#A32D2D', fontWeight: '700' }]}>
                  Retiro (sale dinero)
                </Text>
              </Pressable>
              <Pressable
                style={[styles.movChip, movType === 'deposito' && styles.movChipDeposito]}
                onPress={() => setMovType('deposito')}>
                <Text style={[styles.movChipText,
                  movType === 'deposito' && { color: '#0F6E56', fontWeight: '700' }]}>
                  Depósito (entra dinero)
                </Text>
              </Pressable>
            </View>
            <TextInput placeholderTextColor="#9A9A9A" style={styles.input} placeholder="Monto"
              keyboardType="decimal-pad" value={movAmount} onChangeText={setMovAmount} />
            <TextInput placeholderTextColor="#9A9A9A" style={styles.input}
              placeholder="Motivo (ej. pago al proveedor del pan)"
              value={movReason} onChangeText={setMovReason} />
            <Pressable style={styles.button} onPress={saveMovement}>
              <Text style={styles.buttonText}>Registrar movimiento</Text>
            </Pressable>
            <Text style={styles.hint}>
              Los movimientos no se pueden editar ni borrar; un error se
              corrige registrando el movimiento contrario.
            </Text>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 10, paddingBottom: 40 },
  containerWide: { maxWidth: 640, width: '100%', alignSelf: 'center' },
  title: { fontSize: 20, fontWeight: '600' },
  label: { fontSize: 13, color: '#666', marginTop: 6 },
  input: {
    color: '#1F1F1F',
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 16,
  },
  infoBox: { backgroundColor: '#f5f5f5', borderRadius: 10, padding: 12, gap: 2 },
  infoText: { fontSize: 13, color: '#444' },
  denomRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  denomLabel: { width: 70, fontSize: 15, fontWeight: '600' },
  denomInput: {
    color: '#1F1F1F',
    width: 80, borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, textAlign: 'center',
  },
  denomSubtotal: { flex: 1, fontSize: 14, color: '#666', textAlign: 'right' },
  totalBox: {
    backgroundColor: '#E1F5EE', borderRadius: 12, padding: 14, marginTop: 6,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  totalLabel: { color: '#0F6E56', fontSize: 13 },
  totalValue: { color: '#04342C', fontSize: 24, fontWeight: '600' },
  methodBox: {
    borderWidth: 1, borderColor: '#eee', borderRadius: 12, padding: 12, gap: 8,
  },
  methodRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  methodLabel: { flex: 1, fontSize: 13, color: '#333' },
  methodValue: { fontSize: 13, fontWeight: '700', color: '#222' },
  compareBox: { backgroundColor: '#f7f7f7', borderRadius: 12, padding: 12, gap: 4 },
  compareRow: { flexDirection: 'row', justifyContent: 'space-between' },
  compareLabel: { fontSize: 13, color: '#666' },
  compareValue: { fontSize: 13, color: '#333' },
  compareDiffRow: {
    borderTopWidth: 1, borderTopColor: '#e8e8e8', paddingTop: 6, marginTop: 2,
  },
  compareDiff: { fontSize: 14, fontWeight: '700' },
  toleranceBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FAEEDA', borderRadius: 10, padding: 10,
  },
  toleranceText: { flex: 1, fontSize: 12, color: '#633806', lineHeight: 16 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  movementSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 32, gap: 10,
  },
  movementTitle: { fontSize: 17, fontWeight: '700' },
  movChip: {
    flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
    paddingVertical: 12, alignItems: 'center',
  },
  movChipRetiro: { borderColor: '#A32D2D', backgroundColor: '#FCEBEB' },
  movChipDeposito: { borderColor: '#0F6E56', backgroundColor: '#E1F5EE' },
  movChipText: { fontSize: 12, color: '#555' },
  stepButton: {
    width: 40, height: 40, borderRadius: 10,
    borderWidth: 1.5, borderColor: '#4A1B0C',
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff',
  },
  coinButton: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
    paddingVertical: 12, paddingHorizontal: 12,
  },
  coinButtonText: { fontSize: 15, color: '#222', fontWeight: '600' },
  coinPadSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 32, gap: 12,
  },
  coinDisplay: {
    backgroundColor: '#f7f7f7', borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  coinDisplayText: { fontSize: 28, fontWeight: '700', color: '#222' },
  padGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
  },
  padKey: {
    width: '31.5%', paddingVertical: 16, borderRadius: 12,
    borderWidth: 1, borderColor: '#e5e5e5',
    alignItems: 'center', justifyContent: 'center',
  },
  padKeyText: { fontSize: 22, fontWeight: '600', color: '#222' },
  button: {
    backgroundColor: '#4A1B0C', borderRadius: 10,
    paddingVertical: 14, alignItems: 'center', marginTop: 8,
  },
  buttonText: { color: '#FAECE7', fontSize: 15, fontWeight: '600' },
  hint: { fontSize: 11, color: '#888', textAlign: 'center' },
});

import { useState } from 'react';
import { router } from 'expo-router';
import {
  Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { useOpenShift } from '../../lib/shift';

export default function ShiftScreen() {
  const { employee } = useAuth();
  const { shift, refresh } = useOpenShift(employee);
  const [openingCash, setOpeningCash] = useState('500');
  const [countedCash, setCountedCash] = useState('');
  const [busy, setBusy] = useState(false);

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

  const closeShift = async () => {
    if (!shift) return;
    setBusy(true);

    // Efectivo esperado = fondo inicial + ventas en efectivo del turno
    const { data: cashPayments } = await supabase
      .from('payments')
      .select('amount')
      .eq('shift_id', shift.id)
      .eq('method', 'efectivo');
    const cashSales = (cashPayments ?? []).reduce((a, p) => a + Number(p.amount), 0);
    const expected = +(Number(shift.opening_cash) + cashSales).toFixed(2);
    const counted = parseFloat(countedCash) || 0;
    const difference = +(counted - expected).toFixed(2);

    const { error } = await supabase
      .from('shifts')
      .update({
        status: 'cerrado',
        expected_cash: expected,
        counted_cash: counted,
        cash_difference: difference,
        closed_at: new Date().toISOString(),
      })
      .eq('id', shift.id);

    setBusy(false);
    if (error) {
      Alert.alert('Error', 'No se pudo cerrar el turno.');
      return;
    }
    await refresh();
    Alert.alert(
      'Turno cerrado',
      `Esperado: $${expected.toFixed(2)}\nContado: $${counted.toFixed(2)}\nDiferencia: $${difference.toFixed(2)}`,
    );
    router.back();
  };

  if (!shift) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Abrir turno</Text>
        <Text style={styles.label}>Fondo de caja inicial</Text>
        <TextInput
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
    <ScrollView contentContainerStyle={styles.container}>
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
      <Text style={styles.label}>Efectivo contado en caja</Text>
      <TextInput
        style={styles.input}
        keyboardType="decimal-pad"
        placeholder="0.00"
        value={countedCash}
        onChangeText={setCountedCash}
      />
      {/* TODO: conteo por denominación (billetes/monedas) guardado en
          shifts.denominations, como en el mockup del corte de caja */}
      <Pressable
        style={[styles.button, (busy || !countedCash) && { opacity: 0.6 }]}
        disabled={busy || !countedCash}
        onPress={closeShift}
      >
        <Text style={styles.buttonText}>{busy ? 'Cerrando…' : 'Cerrar turno'}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 10 },
  title: { fontSize: 20, fontWeight: '600' },
  label: { fontSize: 13, color: '#666', marginTop: 6 },
  input: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 16,
  },
  infoBox: { backgroundColor: '#f5f5f5', borderRadius: 10, padding: 12, gap: 2 },
  infoText: { fontSize: 13, color: '#444' },
  button: {
    backgroundColor: '#4A1B0C', borderRadius: 10,
    paddingVertical: 14, alignItems: 'center', marginTop: 8,
  },
  buttonText: { color: '#FAECE7', fontSize: 15, fontWeight: '600' },
});

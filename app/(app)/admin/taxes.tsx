import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import {
  Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet,
  Text, TextInput, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../../lib/auth';
import { supabase } from '../../../lib/supabase';

export default function Taxes() {
  const { employee } = useAuth();
  const [taxRate, setTaxRate] = useState('16');
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!employee?.organization_id) return;
      supabase
        .from('organizations')
        .select('tax_rate')
        .eq('id', employee.organization_id)
        .single()
        .then(({ data, error }) => {
          if (error) {
            Alert.alert('No se pudo cargar el IVA', error.message);
            return;
          }
          setTaxRate(String(Number(data?.tax_rate ?? 16)));
        });
    }, [employee?.organization_id]),
  );

  const parsedRate = Number(taxRate);
  const canSave = taxRate.trim() !== ''
    && Number.isFinite(parsedRate)
    && parsedRate >= 0
    && parsedRate <= 100
    && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    const { error } = await supabase.rpc('update_org_tax_rate', {
      p_tax_rate: parsedRate,
    });
    setSaving(false);
    if (error) {
      Alert.alert('No se pudo guardar', error.message);
      return;
    }
    setTaxRate(String(parsedRate));
    Alert.alert('IVA actualizado', parsedRate === 0
      ? 'Las ventas y tickets no mostrarán IVA.'
      : `Las ventas usarán IVA incluido de ${parsedRate}%.`);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.screen}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.push('/(app)/admin')} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color="#4A1B0C" />
        </Pressable>
        <Text style={styles.headerTitle}>Impuestos</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={styles.iconCircle}>
          <Ionicons name="receipt-outline" size={28} color="#4A1B0C" />
        </View>
        <Text style={styles.title}>IVA incluido</Text>
        <Text style={styles.description}>
          Define el porcentaje de IVA incluido en los precios del menú. El total
          de la venta no cambia; Kahve calcula el desglose para órdenes y tickets.
        </Text>

        <Text style={styles.label}>Porcentaje de IVA</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={taxRate}
            onChangeText={(value) => setTaxRate(value.replace(',', '.'))}
            keyboardType="decimal-pad"
            placeholder="16"
            placeholderTextColor="#9A9A9A"
            maxLength={6}
            returnKeyType="done"
            onSubmitEditing={save}
          />
          <Text style={styles.percent}>%</Text>
        </View>
        {!canSave && taxRate.trim() !== '' && !saving && (
          <Text style={styles.error}>Escribe un valor entre 0 y 100.</Text>
        )}
        <Text style={styles.hint}>
          Usa 0% para no calcular ni mostrar IVA en las ventas y tickets.
        </Text>

        <Pressable
          style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}
          disabled={!canSave}
          onPress={save}
        >
          <Text style={styles.saveText}>{saving ? 'Guardando…' : 'Guardar IVA'}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 54, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#222' },
  content: { padding: 20, maxWidth: 560, width: '100%', alignSelf: 'center' },
  iconCircle: {
    width: 56, height: 56, borderRadius: 12, backgroundColor: '#FAECE7',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  title: { fontSize: 22, fontWeight: '700', color: '#222' },
  description: { fontSize: 14, lineHeight: 21, color: '#666', marginTop: 6, marginBottom: 24 },
  label: { fontSize: 13, fontWeight: '600', color: '#333', marginBottom: 8 },
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  input: {
    flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 18, color: '#222',
  },
  percent: { fontSize: 20, fontWeight: '700', color: '#4A1B0C', marginLeft: 10 },
  hint: { fontSize: 12, lineHeight: 18, color: '#888', marginTop: 8 },
  error: { fontSize: 12, color: '#A32D2D', marginTop: 8 },
  saveButton: {
    backgroundColor: '#4A1B0C', borderRadius: 10, paddingVertical: 14,
    alignItems: 'center', marginTop: 24,
  },
  saveButtonDisabled: { opacity: 0.45 },
  saveText: { color: '#FAECE7', fontSize: 15, fontWeight: '700' },
});
import { useMemo, useState } from 'react';
import { router } from 'expo-router';
import {
  Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { useOpenShift } from '../../lib/shift';
import { useCart, cartTotals } from '../../store/cart';
import type { CardType, PaymentMethod } from '../../types/db';

// Montos rápidos: redondeos hacia arriba útiles + billetes comunes
function quickAmounts(total: number): number[] {
  const roundedTen = Math.ceil(total / 10) * 10;
  const roundedFifty = Math.ceil(total / 50) * 50;
  const options = [roundedTen, roundedFifty, roundedFifty + 50, 500, 1000];
  return [...new Set(options)].filter((x) => x >= total).slice(0, 4);
}

export default function Charge() {
  const { employee } = useAuth();
  const { shift } = useOpenShift(employee);
  const cart = useCart();

  const [method, setMethod] = useState<PaymentMethod>('efectivo');
  const [cardType, setCardType] = useState<CardType>('debito');
  const [received, setReceived] = useState<number | null>(null);
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);

  const subtotal = cart.subtotal();
  const { tax, total } = cartTotals(subtotal);
  const amounts = useMemo(() => quickAmounts(total), [total]);
  const change = received !== null ? +(received - total).toFixed(2) : null;

  const canConfirm =
    cart.lines.length > 0 &&
    !busy &&
    (method !== 'efectivo' || (received !== null && received >= total));

  const confirm = async () => {
    if (!employee || !shift) return;
    setBusy(true);

    const { data: order, error } = await supabase
      .from('orders')
      .insert({
        organization_id: employee.organization_id,
        branch_id: shift.branch_id,
        shift_id: shift.id,
        customer_name: cart.customerName || null,
        order_type: cart.orderType,
        status: 'pagada',
        subtotal,
        tax,
        total,
        created_by: employee.id,
        paid_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error || !order) {
      setBusy(false);
      Alert.alert('Error', 'No se pudo registrar la orden.');
      return;
    }

    for (const line of cart.lines) {
      const { data: item } = await supabase
        .from('order_items')
        .insert({
          order_id: order.id,
          product_id: line.product.id,
          product_name: line.product.name,
          unit_price: line.product.base_price,
          quantity: line.quantity,
          notes: line.notes ?? null,
        })
        .select()
        .single();

      if (item && line.modifiers.length > 0) {
        await supabase.from('order_item_modifiers').insert(
          line.modifiers.map((m) => ({
            order_item_id: item.id,
            modifier_name: m.name,
            price_delta: m.price_delta,
          })),
        );
      }
    }

    await supabase.from('payments').insert({
      organization_id: employee.organization_id,
      order_id: order.id,
      shift_id: shift.id,
      method,
      card_type: method === 'tarjeta' ? cardType : null,
      amount: total,
      received: method === 'efectivo' ? received : null,
      change_due: method === 'efectivo' ? change : null,
      reference: reference || null,
      created_by: employee.id,
    });

    cart.clear();
    setBusy(false);
    Alert.alert(
      `Orden #${String(order.order_number).padStart(3, '0')}`,
      'Pago registrado. Enviada a preparación.',
    );
    router.back();
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.totalBox}>
        <Text style={styles.totalLabel}>Total a cobrar</Text>
        <Text style={styles.totalValue}>${total.toFixed(2)}</Text>
        <Text style={styles.totalSub}>IVA incluido ${tax.toFixed(2)}</Text>
      </View>

      <Text style={styles.sectionTitle}>¿Cómo pagó el cliente?</Text>
      <View style={styles.methodRow}>
        {(['efectivo', 'tarjeta', 'transferencia'] as PaymentMethod[]).map((m) => (
          <Pressable
            key={m}
            style={[styles.methodButton, method === m && styles.methodSelected]}
            onPress={() => setMethod(m)}
          >
            <Text style={[styles.methodText, method === m && styles.methodTextSelected]}>
              {m === 'efectivo' ? 'Efectivo' : m === 'tarjeta' ? 'Tarjeta' : 'Transf.'}
            </Text>
          </Pressable>
        ))}
      </View>

      {method === 'tarjeta' && (
        <>
          <Text style={styles.sectionTitle}>Tipo de tarjeta</Text>
          <View style={styles.methodRow}>
            {(['debito', 'credito'] as CardType[]).map((c) => (
              <Pressable
                key={c}
                style={[styles.methodButton, cardType === c && styles.methodSelected]}
                onPress={() => setCardType(c)}
              >
                <Text style={[styles.methodText, cardType === c && styles.methodTextSelected]}>
                  {c === 'debito' ? 'Débito' : 'Crédito'}
                </Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            style={styles.input}
            placeholder="Referencia del voucher (opcional)"
            value={reference}
            onChangeText={setReference}
          />
          <Text style={styles.hint}>
            Cobra en la terminal física y confirma aquí una vez aprobado.
          </Text>
        </>
      )}

      {method === 'efectivo' && (
        <>
          <Text style={styles.sectionTitle}>Recibido</Text>
          <View style={styles.methodRow}>
            {amounts.map((a) => (
              <Pressable
                key={a}
                style={[styles.methodButton, received === a && styles.methodSelected]}
                onPress={() => setReceived(a)}
              >
                <Text style={[styles.methodText, received === a && styles.methodTextSelected]}>
                  ${a}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.methodRow}>
            <Pressable
              style={[styles.methodButton, received === total && styles.methodSelected]}
              onPress={() => setReceived(total)}
            >
              <Text style={[styles.methodText, received === total && styles.methodTextSelected]}>
                Exacto
              </Text>
            </Pressable>
            <TextInput
              style={[styles.input, { flex: 1, marginTop: 0 }]}
              placeholder="Otro monto"
              keyboardType="decimal-pad"
              onChangeText={(t) => setReceived(t ? parseFloat(t) : null)}
            />
          </View>
          {change !== null && change >= 0 && (
            <View style={styles.changeBox}>
              <Text style={styles.changeLabel}>Cambio a entregar</Text>
              <Text style={styles.changeValue}>${change.toFixed(2)}</Text>
            </View>
          )}
        </>
      )}

      <Pressable
        style={[styles.confirmButton, !canConfirm && { opacity: 0.5 }]}
        disabled={!canConfirm}
        onPress={confirm}
      >
        <Text style={styles.confirmText}>
          {busy ? 'Registrando…' : `Confirmar pago · $${total.toFixed(2)}`}
        </Text>
      </Pressable>
      <Text style={styles.hint}>La orden pasará a la cola de preparación al confirmar.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 10 },
  totalBox: {
    backgroundColor: '#4A1B0C', borderRadius: 14, padding: 18, alignItems: 'center',
  },
  totalLabel: { color: '#F5C4B3', fontSize: 12 },
  totalValue: { color: '#FAECE7', fontSize: 32, fontWeight: '600' },
  totalSub: { color: '#F0997B', fontSize: 11, marginTop: 2 },
  sectionTitle: { fontSize: 13, color: '#666', marginTop: 8 },
  methodRow: { flexDirection: 'row', gap: 8 },
  methodButton: {
    flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
    paddingVertical: 12, alignItems: 'center',
  },
  methodSelected: { borderColor: '#4A1B0C', borderWidth: 2, backgroundColor: '#FAECE7' },
  methodText: { fontSize: 14, color: '#444' },
  methodTextSelected: { color: '#4A1B0C', fontWeight: '600' },
  input: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginTop: 4,
  },
  changeBox: {
    backgroundColor: '#E1F5EE', borderRadius: 12, padding: 14,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  changeLabel: { color: '#0F6E56', fontSize: 13 },
  changeValue: { color: '#04342C', fontSize: 24, fontWeight: '600' },
  confirmButton: {
    backgroundColor: '#4A1B0C', borderRadius: 10,
    paddingVertical: 15, alignItems: 'center', marginTop: 8,
  },
  confirmText: { color: '#FAECE7', fontSize: 15, fontWeight: '600' },
  hint: { fontSize: 11, color: '#888', textAlign: 'center' },
});

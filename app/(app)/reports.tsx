import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../../lib/supabase';

interface Summary {
  total_sales: number;
  order_count: number;
  avg_ticket: number;
  local_count: number;
  takeout_count: number;
}

interface PaymentRow {
  method: string;
  card_type: string | null;
  total: number;
  tx_count: number;
}

export default function Reports() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [payments, setPayments] = useState<PaymentRow[]>([]);

  useFocusEffect(
    useCallback(() => {
      supabase.rpc('report_sales_summary').then(({ data }) => {
        setSummary(data?.[0] ?? null);
      });
      supabase.rpc('report_payments_breakdown').then(({ data }) => {
        setPayments(data ?? []);
      });
    }, []),
  );

  const labelFor = (p: PaymentRow) => {
    if (p.method === 'tarjeta') {
      return p.card_type === 'debito' ? 'Tarjeta débito' : 'Tarjeta crédito';
    }
    return p.method === 'efectivo' ? 'Efectivo' : 'Transferencia';
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.heroLabel}>Ventas del día</Text>
        <Text style={styles.heroValue}>
          ${(summary?.total_sales ?? 0).toFixed(2)}
        </Text>
        <Text style={styles.heroSub}>
          {summary?.order_count ?? 0} órdenes · ticket promedio $
          {(summary?.avg_ticket ?? 0).toFixed(2)}
        </Text>
      </View>

      <Text style={styles.sectionTitle}>Pagos</Text>
      {payments.map((p) => (
        <View key={`${p.method}-${p.card_type}`} style={styles.row}>
          <Text style={styles.rowLabel}>{labelFor(p)}</Text>
          <Text style={styles.rowValue}>
            ${Number(p.total).toFixed(2)} · {p.tx_count}
          </Text>
        </View>
      ))}
      {payments.length === 0 && (
        <Text style={styles.empty}>Aún no hay pagos registrados hoy.</Text>
      )}

      {/* TODO: gráfica de ventas por hora con report_sales_by_hour
          (victory-native o react-native-svg) y top de productos con
          report_top_products */}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 8 },
  hero: { backgroundColor: '#4A1B0C', borderRadius: 14, padding: 18, marginBottom: 8 },
  heroLabel: { color: '#F5C4B3', fontSize: 12 },
  heroValue: { color: '#FAECE7', fontSize: 30, fontWeight: '600', marginTop: 2 },
  heroSub: { color: '#F0997B', fontSize: 12, marginTop: 4 },
  sectionTitle: { fontSize: 15, fontWeight: '600', marginTop: 8 },
  row: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  rowLabel: { fontSize: 14 },
  rowValue: { fontSize: 14, fontWeight: '600' },
  empty: { color: '#888', fontSize: 13 },
});

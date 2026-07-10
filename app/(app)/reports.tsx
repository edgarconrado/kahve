import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { supabase } from '../../lib/supabase';

type Period = 'hoy' | 'semana' | 'mes' | 'año';
const PERIODS: { key: Period; label: string }[] = [
  { key: 'hoy', label: 'Hoy' },
  { key: 'semana', label: 'Semana' },
  { key: 'mes', label: 'Mes' },
  { key: 'año', label: 'Año' },
];
const PERIOD_TITLE: Record<Period, string> = {
  hoy: 'Ventas del día', semana: 'Ventas de la semana',
  mes: 'Ventas del mes', 'año': 'Ventas del año',
};

interface Summary {
  total_sales: number; order_count: number; avg_ticket: number;
  local_count: number; takeout_count: number;
}
interface BarRow { label: string; total: number; highlight?: boolean }
interface TopRow { product_name: string; units: number; revenue: number }
interface PaymentRow { method: string; card_type: string | null; total: number; tx_count: number }
interface Ticket {
  id: string; order_number: number; customer_name: string | null;
  status: string; total: number; created_at: string; cancel_reason: string | null;
  order_items: { product_name: string; quantity: number }[];
  payments: { method: string; card_type: string | null; amount: number }[];
}

const PAYMENT_META: Record<string, { label: string; color: string }> = {
  'efectivo':        { label: 'Efectivo',        color: '#1D9E75' },
  'tarjeta-debito':  { label: 'Tarjeta débito',  color: '#378ADD' },
  'tarjeta-credito': { label: 'Tarjeta crédito', color: '#7F77DD' },
  'transferencia':   { label: 'Transferencia',   color: '#B4B2A9' },
};
const paymentKey = (p: { method: string; card_type: string | null }) =>
  p.method === 'tarjeta' ? `tarjeta-${p.card_type}` : p.method;
const paymentLabel = (p: { method: string; card_type: string | null }) =>
  PAYMENT_META[paymentKey(p)]?.label ?? p.method;

const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const MONTHS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

function rangeFor(period: Period): { from: Date; to: Date } {
  const to = new Date();
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  if (period === 'semana') {
    const dow = (from.getDay() + 6) % 7; // lunes = 0
    from.setDate(from.getDate() - dow);
  } else if (period === 'mes') {
    from.setDate(1);
  } else if (period === 'año') {
    from.setMonth(0, 1);
  }
  return { from, to };
}

export default function Reports() {
  const [period, setPeriod] = useState<Period>('hoy');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [bars, setBars] = useState<BarRow[]>([]);
  const [top, setTop] = useState<TopRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [avgPrepSeconds, setAvgPrepSeconds] = useState<number | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [showTickets, setShowTickets] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    const { from, to } = rangeFor(period);
    const pFrom = isoDate(from);
    const pTo = isoDate(to);

    if (period === 'hoy') {
      const [{ data: s }, { data: h }, { data: t }, { data: p }] = await Promise.all([
        supabase.rpc('report_sales_summary'),
        supabase.rpc('report_sales_by_hour'),
        supabase.rpc('report_top_products'),
        supabase.rpc('report_payments_breakdown'),
      ]);
      setSummary(s?.[0] ?? null);
      const hourRows = (h ?? []) as { hour_of_day: number; total: number }[];
      const max = Math.max(...hourRows.map((r) => Number(r.total)), 0);
      setBars(hourRows.map((r) => ({
        label: r.hour_of_day === 12 ? '12pm'
          : r.hour_of_day > 12 ? `${r.hour_of_day - 12}pm` : `${r.hour_of_day}am`,
        total: Number(r.total),
        highlight: Number(r.total) === max,
      })));
      setTop(t ?? []);
      setPayments(p ?? []);
    } else {
      const [{ data: s }, { data: d }, { data: t }, { data: p }] = await Promise.all([
        supabase.rpc('report_sales_summary_range', { p_from: pFrom, p_to: pTo }),
        supabase.rpc('report_sales_by_day', { p_from: pFrom, p_to: pTo }),
        supabase.rpc('report_top_products_range', { p_from: pFrom, p_to: pTo }),
        supabase.rpc('report_payments_breakdown_range', { p_from: pFrom, p_to: pTo }),
      ]);
      setSummary(s?.[0] ?? null);
      const dayRows = (d ?? []) as { day: string; total: number }[];
      let rows: BarRow[];
      if (period === 'año') {
        // Agregar por mes
        const byMonth = new Array(12).fill(0);
        dayRows.forEach((r) => { byMonth[new Date(r.day).getMonth()] += Number(r.total); });
        rows = byMonth.map((total, i) => ({ label: MONTHS[i], total }))
          .filter((r, i) => r.total > 0 || i <= new Date().getMonth());
      } else {
        rows = dayRows.map((r) => ({
          label: String(new Date(r.day + 'T12:00:00').getDate()),
          total: Number(r.total),
        }));
      }
      const max = Math.max(...rows.map((r) => r.total), 0);
      setBars(rows.map((r) => ({ ...r, highlight: r.total === max && max > 0 })));
      setTop(t ?? []);
      setPayments(p ?? []);
    }

    // Tiempo de preparación promedio del periodo
    const { data: prep } = await supabase
      .from('orders')
      .select('paid_at, ready_at')
      .not('ready_at', 'is', null)
      .gte('created_at', from.toISOString());
    const times = (prep ?? [])
      .filter((o) => o.paid_at && o.ready_at)
      .map((o) => (new Date(o.ready_at).getTime() - new Date(o.paid_at).getTime()) / 1000);
    setAvgPrepSeconds(times.length ? times.reduce((a, b) => a + b, 0) / times.length : null);

    // Tickets del periodo (los más recientes primero)
    const { data: tix } = await supabase
      .from('orders')
      .select('id, order_number, customer_name, status, total, created_at, cancel_reason,'
        + ' order_items(product_name, quantity), payments(method, card_type, amount)')
      .gte('created_at', from.toISOString())
      .order('created_at', { ascending: false })
      .limit(100);
    setTickets((tix as Ticket[]) ?? []);
  }, [period]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const paymentsTotal = payments.reduce((a, p) => a + Number(p.total), 0);
  const maxBar = Math.max(...bars.map((b) => b.total), 1);
  const maxTopRevenue = Math.max(...top.map((t) => Number(t.revenue)), 1);
  const fmtPrep = avgPrepSeconds === null ? '—'
    : `${Math.floor(avgPrepSeconds / 60)}:${String(Math.round(avgPrepSeconds % 60)).padStart(2, '0')} min`;
  const fmtDateTime = (iso: string) =>
    new Date(iso).toLocaleString('es-MX', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });

  // ---- Exportar PDF y compartir (WhatsApp, correo, etc. via share sheet) ----
  const exportPdf = async () => {
    setExporting(true);
    try {
      const rows = tickets.map((t) => `
        <tr>
          <td>#${String(t.order_number).padStart(3, '0')}</td>
          <td>${fmtDateTime(t.created_at)}</td>
          <td>${t.customer_name ?? '—'}</td>
          <td>${t.payments.map(paymentLabel).join(', ') || '—'}</td>
          <td style="text-align:right">$${Number(t.total).toFixed(2)}</td>
          <td>${t.status === 'cancelada' ? 'CANCELADA' : ''}</td>
        </tr>`).join('');
      const pays = payments.map((p) => `
        <tr><td>${paymentLabel(p)}</td>
        <td style="text-align:right">$${Number(p.total).toFixed(2)}</td></tr>`).join('');
      const tops = top.map((t, i) => `
        <tr><td>${i + 1}. ${t.product_name}</td><td>${t.units}</td>
        <td style="text-align:right">$${Number(t.revenue).toFixed(2)}</td></tr>`).join('');

      const html = `
        <html><head><meta charset="utf-8"><style>
          body { font-family: -apple-system, Helvetica, sans-serif; padding: 24px; color: #222; }
          h1 { color: #4A1B0C; margin-bottom: 0; }
          .sub { color: #777; margin-top: 4px; }
          .hero { background: #4A1B0C; color: #FAECE7; border-radius: 12px;
                  padding: 16px 20px; margin: 16px 0; }
          .hero .big { font-size: 30px; font-weight: 700; }
          h2 { font-size: 15px; margin-top: 24px; border-bottom: 1px solid #eee;
               padding-bottom: 6px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          td, th { padding: 6px 8px; border-bottom: 1px solid #f0f0f0; text-align: left; }
        </style></head><body>
          <h1>Kahve · Reporte de ventas</h1>
          <div class="sub">${PERIOD_TITLE[period]} · generado el
            ${new Date().toLocaleString('es-MX')}</div>
          <div class="hero">
            <div>${PERIOD_TITLE[period]}</div>
            <div class="big">$${Number(summary?.total_sales ?? 0).toFixed(2)}</div>
            <div>${summary?.order_count ?? 0} órdenes · ticket promedio
              $${Number(summary?.avg_ticket ?? 0).toFixed(2)} ·
              preparación promedio ${fmtPrep}</div>
          </div>
          <h2>Pagos</h2><table>${pays}</table>
          <h2>Más vendidos</h2><table>${tops}</table>
          <h2>Tickets (${tickets.length})</h2>
          <table>
            <tr><th>#</th><th>Fecha</th><th>Cliente</th><th>Pago</th>
              <th style="text-align:right">Total</th><th></th></tr>
            ${rows}
          </table>
        </body></html>`;

      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Compartir reporte',
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert('PDF generado', `Guardado en: ${uri}`);
      }
    } catch (e: any) {
      Alert.alert('Error al exportar', e?.message ?? 'Intenta de nuevo.');
    }
    setExporting(false);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Selector de periodo + exportar */}
      <View style={styles.topRow}>
        <View style={styles.periodRow}>
          {PERIODS.map((p) => (
            <Pressable key={p.key}
              style={[styles.periodChip, period === p.key && styles.periodChipOn]}
              onPress={() => setPeriod(p.key)}>
              <Text style={[styles.periodText, period === p.key && styles.periodTextOn]}>
                {p.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <Pressable style={styles.exportButton} onPress={exportPdf} disabled={exporting}>
          <Ionicons name="share-outline" size={17} color="#4A1B0C" />
        </Pressable>
      </View>

      <View style={styles.hero}>
        <Text style={styles.heroLabel}>{PERIOD_TITLE[period]}</Text>
        <Text style={styles.heroValue}>
          ${Number(summary?.total_sales ?? 0).toFixed(2)}
        </Text>
        <Text style={styles.heroSub}>
          {summary?.order_count ?? 0} órdenes · {summary?.takeout_count ?? 0} llevar
          · {summary?.local_count ?? 0} local
        </Text>
      </View>

      <View style={styles.metricsRow}>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Ticket promedio</Text>
          <Text style={styles.metricValue}>
            ${Number(summary?.avg_ticket ?? 0).toFixed(2)}
          </Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Prep. promedio</Text>
          <Text style={styles.metricValue}>{fmtPrep}</Text>
        </View>
      </View>

      {/* Gráfica: por hora (hoy), por día (semana/mes), por mes (año) */}
      <Text style={styles.sectionTitle}>
        {period === 'hoy' ? 'Ventas por hora'
          : period === 'año' ? 'Ventas por mes' : 'Ventas por día'}
      </Text>
      {bars.length === 0 ? (
        <Text style={styles.empty}>Sin ventas en este periodo.</Text>
      ) : (
        <View style={styles.chartCard}>
          <View style={styles.chartArea}>
            {bars.map((b, i) => (
              <View key={`${b.label}-${i}`} style={styles.barColumn}>
                <View style={styles.barTrack}>
                  <View style={[
                    styles.bar,
                    { height: `${Math.max((b.total / maxBar) * 100, 3)}%` },
                    b.highlight && styles.barPeak,
                  ]} />
                </View>
                {(bars.length <= 12 || i % Math.ceil(bars.length / 10) === 0) && (
                  <Text style={styles.barLabel}>{b.label}</Text>
                )}
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Pagos */}
      <Text style={styles.sectionTitle}>Pagos</Text>
      {payments.length === 0 ? (
        <Text style={styles.empty}>Sin pagos en este periodo.</Text>
      ) : (
        <View style={styles.chartCard}>
          <View style={styles.stackedBar}>
            {payments.map((p) => (
              <View key={paymentKey(p)} style={{
                flex: Number(p.total),
                backgroundColor: PAYMENT_META[paymentKey(p)]?.color ?? '#ccc',
              }} />
            ))}
          </View>
          {payments.map((p) => {
            const pct = paymentsTotal > 0
              ? Math.round((Number(p.total) / paymentsTotal) * 100) : 0;
            return (
              <View key={paymentKey(p)} style={styles.legendRow}>
                <View style={[styles.legendDot,
                  { backgroundColor: PAYMENT_META[paymentKey(p)]?.color }]} />
                <Text style={styles.legendLabel}>{paymentLabel(p)}</Text>
                <Text style={styles.legendValue}>
                  ${Number(p.total).toFixed(2)} · {pct}%
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {/* Top de productos */}
      <Text style={styles.sectionTitle}>Más vendidos</Text>
      {top.length === 0 ? (
        <Text style={styles.empty}>Sin datos todavía.</Text>
      ) : (
        <View style={styles.chartCard}>
          {top.map((t, i) => (
            <View key={t.product_name} style={styles.topRow2}>
              <Text style={styles.topName} numberOfLines={1}>
                {i + 1}. {t.product_name}
              </Text>
              <View style={styles.topBarTrack}>
                <View style={[styles.topBar,
                  { width: `${(Number(t.revenue) / maxTopRevenue) * 100}%` }]} />
              </View>
              <Text style={styles.topValue}>
                {t.units} · ${Number(t.revenue).toFixed(0)}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Tickets */}
      <Pressable style={styles.ticketsButton} onPress={() => setShowTickets(true)}>
        <Ionicons name="receipt-outline" size={17} color="#4A1B0C" />
        <Text style={styles.ticketsButtonText}>
          Ver tickets del periodo ({tickets.length})
        </Text>
        <Ionicons name="chevron-forward" size={15} color="#4A1B0C" />
      </Pressable>

      <Modal visible={showTickets} transparent animationType="slide"
        onRequestClose={() => setShowTickets(false)}>
        <Pressable style={styles.backdrop} onPress={() => setShowTickets(false)} />
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>Tickets · {PERIOD_TITLE[period]}</Text>
          <FlatList
            data={tickets}
            keyExtractor={(t) => t.id}
            contentContainerStyle={{ gap: 8, paddingBottom: 12 }}
            renderItem={({ item }) => {
              const isOpen = expanded === item.id;
              const cancelled = item.status === 'cancelada';
              return (
                <Pressable
                  style={[styles.ticketCard, cancelled && styles.ticketCancelled]}
                  onPress={() => setExpanded(isOpen ? null : item.id)}>
                  <View style={styles.ticketHeader}>
                    <Text style={styles.ticketNumber}>
                      #{String(item.order_number).padStart(3, '0')}
                      {item.customer_name ? ` · ${item.customer_name}` : ''}
                    </Text>
                    <Text style={[styles.ticketTotal,
                      cancelled && { textDecorationLine: 'line-through', color: '#999' }]}>
                      ${Number(item.total).toFixed(2)}
                    </Text>
                  </View>
                  <Text style={styles.ticketMeta}>
                    {fmtDateTime(item.created_at)}
                    {item.payments.length > 0
                      ? ` · ${item.payments.map(paymentLabel).join(', ')}` : ''}
                    {cancelled ? ' · CANCELADA' : ''}
                  </Text>
                  {isOpen && (
                    <View style={styles.ticketDetail}>
                      {item.order_items.map((oi, i) => (
                        <Text key={i} style={styles.ticketItem}>
                          {oi.quantity}x {oi.product_name}
                        </Text>
                      ))}
                      {cancelled && item.cancel_reason ? (
                        <Text style={styles.ticketCancelReason}>
                          Motivo: {item.cancel_reason}
                        </Text>
                      ) : null}
                    </View>
                  )}
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 8, paddingBottom: 32, backgroundColor: '#fff' },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  periodRow: { flexDirection: 'row', gap: 6, flex: 1 },
  periodChip: {
    borderWidth: 1, borderColor: '#e5e5e5', borderRadius: 20,
    paddingVertical: 6, paddingHorizontal: 14,
  },
  periodChipOn: { backgroundColor: '#4A1B0C', borderColor: '#4A1B0C' },
  periodText: { fontSize: 12, color: '#555' },
  periodTextOn: { color: '#FAECE7', fontWeight: '600' },
  exportButton: {
    width: 36, height: 36, borderRadius: 18, borderWidth: 1,
    borderColor: '#4A1B0C', alignItems: 'center', justifyContent: 'center',
  },
  hero: { backgroundColor: '#4A1B0C', borderRadius: 14, padding: 18 },
  heroLabel: { color: '#F5C4B3', fontSize: 12 },
  heroValue: { color: '#FAECE7', fontSize: 30, fontWeight: '600', marginTop: 2 },
  heroSub: { color: '#F0997B', fontSize: 12, marginTop: 4 },
  metricsRow: { flexDirection: 'row', gap: 8 },
  metricCard: {
    flex: 1, backgroundColor: '#f7f7f7', borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 14,
  },
  metricLabel: { fontSize: 11, color: '#777' },
  metricValue: { fontSize: 18, fontWeight: '700', marginTop: 2, color: '#222' },
  sectionTitle: { fontSize: 15, fontWeight: '600', marginTop: 10 },
  empty: { color: '#888', fontSize: 13 },
  chartCard: {
    borderWidth: 1, borderColor: '#eee', borderRadius: 12, padding: 14, gap: 8,
  },
  chartArea: { flexDirection: 'row', height: 130, gap: 3 },
  barColumn: { flex: 1, alignItems: 'center' },
  barTrack: { flex: 1, width: '100%', justifyContent: 'flex-end' },
  bar: { width: '100%', backgroundColor: '#F0997B', borderRadius: 3 },
  barPeak: { backgroundColor: '#D85A30' },
  barLabel: { fontSize: 8, color: '#999', marginTop: 4 },
  stackedBar: {
    flexDirection: 'row', height: 10, borderRadius: 5,
    overflow: 'hidden', marginBottom: 4,
  },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendDot: { width: 9, height: 9, borderRadius: 2 },
  legendLabel: { flex: 1, fontSize: 13, color: '#444' },
  legendValue: { fontSize: 13, fontWeight: '600' },
  topRow2: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  topName: { width: 110, fontSize: 12, color: '#444' },
  topBarTrack: {
    flex: 1, height: 8, backgroundColor: '#f4f4f4',
    borderRadius: 4, overflow: 'hidden',
  },
  topBar: { height: '100%', backgroundColor: '#4A1B0C', borderRadius: 4 },
  topValue: { width: 76, fontSize: 11, color: '#666', textAlign: 'right' },
  ticketsButton: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: '#4A1B0C', borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 14, marginTop: 8,
  },
  ticketsButtonText: { flex: 1, color: '#4A1B0C', fontWeight: '600', fontSize: 13 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 24, maxHeight: '80%',
  },
  sheetTitle: { fontSize: 17, fontWeight: '700', marginBottom: 10 },
  ticketCard: {
    borderWidth: 1, borderColor: '#eee', borderRadius: 12, padding: 12,
  },
  ticketCancelled: { backgroundColor: '#FCEBEB', borderColor: '#f3d4d4' },
  ticketHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  ticketNumber: { fontSize: 14, fontWeight: '700', color: '#222' },
  ticketTotal: { fontSize: 14, fontWeight: '700', color: '#222' },
  ticketMeta: { fontSize: 11, color: '#888', marginTop: 2 },
  ticketDetail: {
    marginTop: 8, borderTopWidth: 1, borderTopColor: '#f0f0f0', paddingTop: 8,
  },
  ticketItem: { fontSize: 13, color: '#333', paddingVertical: 1 },
  ticketCancelReason: { fontSize: 12, color: '#A32D2D', marginTop: 4, fontStyle: 'italic' },
});

import { useCallback, useEffect, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useAudioPlayer } from 'expo-audio';
import {
  Alert, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { can } from '../../lib/permissions';
import { usePlan, proFeatureAlert } from '../../lib/plan';
import type { Order } from '../../types/db';

interface QueueItem {
  id: string;
  product_name: string;
  quantity: number;
  notes: string | null;
  order_item_modifiers: { modifier_name: string }[];
}
type QueueOrder = Order & { order_items: QueueItem[] };

const ACTIVE = ['pagada', 'en_preparacion'];
const LATE_MINUTES = 5;

export default function Queue() {
  const { employee } = useAuth();
  const player = useAudioPlayer(require('../../assets/new-order.wav'));
  const { tier } = usePlan(employee);
  const [orders, setOrders] = useState<QueueOrder[]>([]);
  const [readyToday, setReadyToday] = useState(0);
  const [avgPrepSeconds, setAvgPrepSeconds] = useState<number | null>(null);
  const [, setTick] = useState(0); // fuerza re-render para los cronómetros
  const [cancelTarget, setCancelTarget] = useState<QueueOrder | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<QueueOrder[]>([]);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelBusy, setCancelBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(*, order_item_modifiers(modifier_name))')
      .in('status', ACTIVE)
      .order('created_at');
    if (error) console.log('Error cargando cola:', error.message);
    setOrders((data as QueueOrder[]) ?? []);

    // Métricas del día: cuántas ya salieron y a qué ritmo
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const { data: done } = await supabase
      .from('orders')
      .select('paid_at, ready_at')
      .in('status', ['lista', 'entregada'])
      .gte('created_at', today.toISOString());
    setReadyToday(done?.length ?? 0);
    const times = (done ?? [])
      .filter((o) => o.paid_at && o.ready_at)
      .map((o) => (new Date(o.ready_at).getTime() - new Date(o.paid_at).getTime()) / 1000);
    setAvgPrepSeconds(
      times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : null,
    );
  }, []);

  // Recarga al recuperar foco (aunque Realtime falle, la cola se
  // actualiza al entrar a la tab) + cronómetros cada 30s
  useFocusEffect(
    useCallback(() => {
      load();
      const timer = setInterval(() => setTick((t) => t + 1), 30_000);
      return () => clearInterval(timer);
    }, [load]),
  );

  // Realtime: nuevas órdenes aparecen sin tocar nada
  useEffect(() => {
    if (!employee) return;
    const channel = supabase
      .channel('kahve-queue')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            // Orden nueva: avisar al barista con sonido y vibración
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
              .catch(() => {});
            try { player.seekTo(0); player.play(); } catch {}
          }
          load();
        },
      )
      .subscribe((status) => console.log('Realtime cola:', status));
    return () => { supabase.removeChannel(channel); };
  }, [employee, load]);

  const advance = async (order: QueueOrder) => {
    const next = order.status === 'pagada' ? 'en_preparacion' : 'lista';
    const patch: Record<string, unknown> = { status: next };
    if (next === 'en_preparacion') patch.prepared_by = employee?.id;
    if (next === 'lista') patch.ready_at = new Date().toISOString();
    const { error } = await supabase.from('orders').update(patch).eq('id', order.id);
    if (error) console.log('Error avanzando orden:', error.message);
    load();
  };

  const openHistory = async () => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from('orders')
      .select('*, order_items(*, order_item_modifiers(modifier_name))')
      .in('status', ['lista', 'entregada', 'cancelada'])
      .gte('created_at', today.toISOString())
      .order('created_at', { ascending: false });
    setHistory((data as QueueOrder[]) ?? []);
    setShowHistory(true);
  };

  const markDelivered = async (order: QueueOrder) => {
    await supabase
      .from('orders')
      .update({ status: 'entregada', delivered_at: new Date().toISOString() })
      .eq('id', order.id);
    openHistory(); // recarga el historial
    load();
  };

  const confirmCancel = async () => {
    if (!cancelTarget) return;
    setCancelBusy(true);
    const { error } = await supabase.rpc('cancel_order', {
      p_order_id: cancelTarget.id,
      p_reason: cancelReason.trim() || 'Sin motivo especificado',
    });
    setCancelBusy(false);
    if (error) {
      Alert.alert('No se pudo cancelar', error.message);
      return;
    }
    setCancelTarget(null);
    setCancelReason('');
    load();
  };

  const canPrepare = can(employee?.role ?? null, 'queue.prepare');
  const canCancel = can(employee?.role ?? null, 'orders.cancel');
  const pending = orders.filter((o) => o.status === 'pagada').length;
  const preparing = orders.filter((o) => o.status === 'en_preparacion').length;

  const elapsedMinutes = (o: QueueOrder) =>
    Math.floor((Date.now() - new Date(o.paid_at ?? o.created_at).getTime()) / 60_000);
  const fmtElapsed = (min: number) => (min < 1 ? '<1 min' : `${min} min`);

  return (
    <View style={styles.container}>
      <View style={styles.summaryRow}>
        <View style={[styles.pill, { backgroundColor: '#FAEEDA' }]}>
          <Text style={[styles.pillText, { color: '#854F0B' }]}>
            {pending} pendientes
          </Text>
        </View>
        <View style={[styles.pill, { backgroundColor: '#E6F1FB' }]}>
          <Text style={[styles.pillText, { color: '#185FA5' }]}>
            {preparing} en preparación
          </Text>
        </View>
        <View style={[styles.pill, { backgroundColor: '#EAF3DE' }]}>
          <Text style={[styles.pillText, { color: '#3B6D11' }]}>
            {readyToday} listas hoy
          </Text>
        </View>
        <Pressable style={{ marginLeft: 'auto' }} hitSlop={8}
          onPress={() => tier === 'free'
            ? proFeatureAlert('El tablero de órdenes listas para tus clientes')
            : router.push('/(app)/board')}>
          <Ionicons
            name={tier === 'free' ? 'lock-closed' : 'tv-outline'}
            size={21}
            color={tier === 'free' ? '#bbb' : '#4A1B0C'}
          />
        </Pressable>
      </View>

      <FlatList
        data={orders}
        keyExtractor={(o) => o.id}
        contentContainerStyle={{ padding: 16, paddingTop: 8, gap: 12 }}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Ionicons name="checkmark-done-circle-outline" size={40} color="#1D9E75" />
            <Text style={styles.empty}>Sin órdenes pendientes. La cola está al día.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const minutes = elapsedMinutes(item);
          const late = minutes >= LATE_MINUTES;
          const headerStyle = late
            ? styles.headerLate
            : item.status === 'en_preparacion'
              ? styles.headerPreparing
              : styles.headerPending;
          const headerText = late
            ? styles.headerTextLate
            : item.status === 'en_preparacion'
              ? styles.headerTextPreparing
              : styles.headerTextPending;
          return (
            <View style={styles.card}>
              <View style={[styles.cardHeader, headerStyle]}>
                <Text style={[styles.orderNumber, headerText]}>
                  #{String(item.order_number).padStart(3, '0')}
                  {item.customer_name ? ` · ${item.customer_name}` : ''}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  {late && <Ionicons name="warning" size={13} color="#A32D2D" />}
                  <Text style={[styles.elapsed, headerText]}>{fmtElapsed(minutes)}</Text>
                  {canCancel && (
                    <Pressable
                      hitSlop={10}
                      onPress={() => { setCancelTarget(item); setCancelReason(''); }}
                    >
                      <Ionicons name="close-circle" size={19} color="#A32D2D" />
                    </Pressable>
                  )}
                </View>
              </View>
              <View style={styles.cardBody}>
                {item.order_items?.map((oi) => (
                  <View key={oi.id} style={{ marginBottom: 6 }}>
                    <Text style={styles.itemLine}>
                      <Text style={{ fontWeight: '700' }}>{oi.quantity}x </Text>
                      {oi.product_name}
                    </Text>
                    {oi.order_item_modifiers?.length > 0 && (
                      <Text style={styles.itemMods}>
                        {oi.order_item_modifiers.map((m) => m.modifier_name).join(' · ')}
                      </Text>
                    )}
                    {oi.notes ? (
                      <Text style={styles.itemNotes}>Nota: {oi.notes}</Text>
                    ) : null}
                  </View>
                ))}
                {canPrepare && (
                  <Pressable
                    style={[
                      styles.actionButton,
                      item.status === 'pagada' && styles.actionOutline,
                    ]}
                    onPress={() => advance(item)}
                  >
                    <Text
                      style={[
                        styles.actionText,
                        item.status === 'pagada' && styles.actionTextOutline,
                      ]}
                    >
                      {item.status === 'pagada' ? 'Iniciar preparación' : 'Marcar lista'}
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>
          );
        }}
      />
      <Modal
        visible={cancelTarget !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setCancelTarget(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1, justifyContent: 'flex-end' }}
        >
        <Pressable style={styles.backdrop} onPress={() => setCancelTarget(null)} />
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>
            Cancelar orden #{String(cancelTarget?.order_number ?? 0).padStart(3, '0')}
          </Text>
          <Text style={styles.sheetWarning}>
            La orden saldrá de la cola y no contará en las ventas. Si ya se
            cobró en efectivo, recuerda devolver el dinero al cliente.
          </Text>
          <TextInput
            style={styles.reasonInput}
            placeholder="Motivo (ej. cliente se retiró, orden equivocada)"
            value={cancelReason}
            onChangeText={setCancelReason}
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable
              style={[styles.sheetButton, styles.sheetButtonOutline]}
              onPress={() => setCancelTarget(null)}
            >
              <Text style={styles.sheetButtonOutlineText}>Conservar orden</Text>
            </Pressable>
            <Pressable
              style={[styles.sheetButton, styles.sheetButtonDanger,
                cancelBusy && { opacity: 0.6 }]}
              disabled={cancelBusy}
              onPress={confirmCancel}
            >
              <Text style={styles.sheetButtonDangerText}>
                {cancelBusy ? 'Cancelando…' : 'Cancelar orden'}
              </Text>
            </Pressable>
          </View>
        </View>
              </KeyboardAvoidingView>
      </Modal>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Prep. promedio hoy:{' '}
          <Text style={{ fontWeight: '700', color: '#222' }}>
            {avgPrepSeconds === null
              ? '—'
              : `${Math.floor(avgPrepSeconds / 60)}:${String(Math.round(avgPrepSeconds % 60)).padStart(2, '0')} min`}
          </Text>
        </Text>
        <Pressable onPress={openHistory} hitSlop={8}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={styles.historyLink}>Ver historial</Text>
          <Ionicons name="arrow-forward" size={13} color="#4A1B0C" />
        </Pressable>
      </View>

      <Modal visible={showHistory} transparent animationType="slide"
        onRequestClose={() => setShowHistory(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1, justifyContent: 'flex-end' }}
        >
        <Pressable style={styles.backdrop} onPress={() => setShowHistory(false)} />
        <View style={[styles.sheet, { maxHeight: '80%' }]}>
          <Text style={styles.sheetTitle}>Historial de hoy ({history.length})</Text>
          <FlatList
            data={history}
            keyExtractor={(o) => o.id}
            contentContainerStyle={{ gap: 8, paddingBottom: 12 }}
            ListEmptyComponent={
              <Text style={{ color: '#888', fontSize: 13 }}>
                Aún no hay órdenes terminadas hoy.
              </Text>
            }
            renderItem={({ item }) => {
              const chip = item.status === 'lista'
                ? { bg: '#EAF3DE', fg: '#3B6D11', label: 'Lista' }
                : item.status === 'entregada'
                  ? { bg: '#f0f0f0', fg: '#666', label: 'Entregada' }
                  : { bg: '#FCEBEB', fg: '#A32D2D', label: 'Cancelada' };
              return (
                <View style={styles.historyCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.historyNumber}>
                      #{String(item.order_number).padStart(3, '0')}
                      {item.customer_name ? ` · ${item.customer_name}` : ''}
                    </Text>
                    <Text style={styles.historyMeta}>
                      {new Date(item.created_at).toLocaleTimeString('es-MX',
                        { hour: '2-digit', minute: '2-digit' })}
                      {' · '}
                      {item.order_items?.map((oi) =>
                        `${oi.quantity}x ${oi.product_name}`).join(', ')}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    <View style={[styles.historyChip, { backgroundColor: chip.bg }]}>
                      <Text style={[styles.historyChipText, { color: chip.fg }]}>
                        {chip.label}
                      </Text>
                    </View>
                    {item.status === 'lista' && canPrepare && (
                      <Pressable onPress={() => markDelivered(item)} hitSlop={6}>
                        <Text style={styles.deliverLink}>Marcar entregada</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              );
            }}
          />
        </View>
              </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 32, gap: 10,
  },
  sheetTitle: { fontSize: 17, fontWeight: '700' },
  sheetWarning: { fontSize: 12, color: '#791F1F', backgroundColor: '#FCEBEB',
    borderRadius: 10, padding: 10, lineHeight: 17 },
  reasonInput: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 14,
  },
  sheetButton: {
    flex: 1, borderRadius: 10, paddingVertical: 13, alignItems: 'center',
  },
  sheetButtonOutline: { borderWidth: 1, borderColor: '#ccc' },
  sheetButtonOutlineText: { color: '#444', fontWeight: '600', fontSize: 13 },
  sheetButtonDanger: { backgroundColor: '#A32D2D' },
  sheetButtonDangerText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  footer: {
    borderTopWidth: 1, borderTopColor: '#eee',
    paddingVertical: 10, paddingHorizontal: 16,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  footerText: { fontSize: 12, color: '#666' },
  historyLink: { fontSize: 12, color: '#4A1B0C', fontWeight: '600' },
  historyCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderColor: '#eee', borderRadius: 12, padding: 12,
  },
  historyNumber: { fontSize: 14, fontWeight: '700', color: '#222' },
  historyMeta: { fontSize: 11, color: '#777', marginTop: 2 },
  historyChip: { borderRadius: 12, paddingVertical: 3, paddingHorizontal: 10 },
  historyChipText: { fontSize: 11, fontWeight: '700' },
  deliverLink: { fontSize: 11, color: '#4A1B0C', fontWeight: '600' },
  summaryRow: { flexDirection: 'row', gap: 8, padding: 16, paddingBottom: 4 },
  pill: { borderRadius: 20, paddingVertical: 5, paddingHorizontal: 14 },
  pillText: { fontSize: 12, fontWeight: '600' },
  emptyBox: { alignItems: 'center', gap: 8, marginTop: 60 },
  empty: { textAlign: 'center', color: '#888' },
  card: {
    borderWidth: 1, borderColor: '#eee', borderRadius: 14, overflow: 'hidden',
    backgroundColor: '#fff',
  },
  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 8, paddingHorizontal: 14,
  },
  headerPending: { backgroundColor: '#FAEEDA' },
  headerPreparing: { backgroundColor: '#E6F1FB' },
  headerLate: { backgroundColor: '#FCEBEB' },
  headerTextPending: { color: '#633806' },
  headerTextPreparing: { color: '#0C447C' },
  headerTextLate: { color: '#791F1F' },
  orderNumber: { fontSize: 14, fontWeight: '700' },
  elapsed: { fontSize: 12, fontWeight: '600' },
  cardBody: { padding: 14, paddingTop: 10 },
  itemLine: { fontSize: 14, color: '#222' },
  itemMods: { fontSize: 12, color: '#666', paddingLeft: 18 },
  itemNotes: { fontSize: 12, color: '#993C1D', paddingLeft: 18, fontStyle: 'italic' },
  actionButton: {
    marginTop: 8, backgroundColor: '#4A1B0C', borderRadius: 10,
    paddingVertical: 11, alignItems: 'center',
  },
  actionOutline: {
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#4A1B0C',
  },
  actionText: { color: '#FAECE7', fontWeight: '600', fontSize: 13 },
  actionTextOutline: { color: '#4A1B0C' },
});

import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import {
  Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, KeyboardAvoidingView, Platform, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { usePlan } from '../../lib/plan';
import { useOpenShift } from '../../lib/shift';
import { can, type Permission } from '../../lib/permissions';

const ROLE_META: Record<string, { label: string; bg: string; fg: string }> = {
  admin:      { label: 'Admin',      bg: '#FAEEDA', fg: '#854F0B' },
  supervisor: { label: 'Supervisor', bg: '#EEEDFE', fg: '#534AB7' },
  cajero:     { label: 'Cajero',     bg: '#E6F1FB', fg: '#185FA5' },
  barista:    { label: 'Barista',    bg: '#E1F5EE', fg: '#0F6E56' },
};

const PERMISSION_LABELS: [Permission, string][] = [
  ['pos.sell',      'Tomar órdenes y cobrar'],
  ['queue.prepare', 'Preparar órdenes'],
  ['orders.cancel', 'Cancelar órdenes cobradas'],
  ['reports.view',  'Ver reportes'],
  ['menu.edit',     'Editar menú y precios'],
  ['team.manage',   'Gestionar empleados'],
];

interface ClosedShift {
  id: string;
  opened_at: string;
  closed_at: string;
  counted_cash: number;
  cash_difference: number;
}

export default function Profile() {
  const { employee, signOut } = useAuth();
  const { width } = useWindowDimensions();
  const isWide = width >= 700;
  const { tier, isTrial, daysLeft } = usePlan(employee);
  const { shift } = useOpenShift(employee);
  const [stats, setStats] = useState({ orders: 0, sold: 0, cancelled: 0 });
  const [showPin, setShowPin] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<ClosedShift[]>([]);
  const [pin1, setPin1] = useState('');
  const [pin2, setPin2] = useState('');
  const [busy, setBusy] = useState(false);
  const [org, setOrg] = useState<{ name: string; slug: string } | null>(null);
  const [branch, setBranch] = useState<{ name: string; address: string | null } | null>(null);

  // Datos de la cafetería (organización y, si aplica, sucursal del empleado)
  useFocusEffect(
    useCallback(() => {
      if (!employee) return;
      supabase
        .from('organizations')
        .select('name, slug')
        .eq('id', employee.organization_id)
        .single()
        .then(({ data }) => setOrg(data));

      if (employee.branch_id) {
        supabase
          .from('branches')
          .select('name, address')
          .eq('id', employee.branch_id)
          .single()
          .then(({ data }) => setBranch(data));
      } else {
        setBranch(null); // admin sin sucursal fija = acceso a todas
      }
    }, [employee?.organization_id, employee?.branch_id]),
  );

  // Estadísticas del turno actual (órdenes creadas por este empleado)
  useFocusEffect(
    useCallback(() => {
      if (!shift || !employee) {
        setStats({ orders: 0, sold: 0, cancelled: 0 });
        return;
      }
      supabase
        .from('orders')
        .select('total, status')
        .eq('shift_id', shift.id)
        .eq('created_by', employee.id)
        .then(({ data }) => {
          const rows = data ?? [];
          const active = rows.filter((o) => o.status !== 'cancelada');
          setStats({
            orders: active.length,
            sold: active.reduce((a, o) => a + Number(o.total), 0),
            cancelled: rows.length - active.length,
          });
        });
    }, [shift?.id, employee?.id]),
  );

  const openHistory = async () => {
    const { data } = await supabase
      .from('shifts')
      .select('id, opened_at, closed_at, counted_cash, cash_difference')
      .eq('status', 'cerrado')
      .order('closed_at', { ascending: false })
      .limit(15);
    setHistory((data as ClosedShift[]) ?? []);
    setShowHistory(true);
  };

  const changePin = async () => {
    if (!/^\d{6}$/.test(pin1)) {
      Alert.alert('PIN inválido', 'El PIN debe ser de 6 dígitos.');
      return;
    }
    if (pin1 !== pin2) {
      Alert.alert('No coinciden', 'Escribe el mismo PIN en ambos campos.');
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pin1 });
    setBusy(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setShowPin(false);
    setPin1(''); setPin2('');
    Alert.alert('PIN actualizado', 'Úsalo en tu próximo inicio de sesión.');
  };

  const handleSignOut = async () => {
    await signOut();
    router.replace('/login');
  };

  const role = employee?.role ?? 'barista';
  const meta = ROLE_META[role];
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('es-MX', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });

  return (
    <ScrollView contentContainerStyle={[styles.container, isWide && styles.containerWide]}>
      {/* Encabezado */}
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {employee?.full_name?.slice(0, 2).toUpperCase() ?? '··'}
          </Text>
        </View>
        <Text style={styles.name}>{employee?.full_name}</Text>
        <Text style={styles.email}>{employee?.email}</Text>
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
          <View style={[styles.roleChip, { backgroundColor: meta.bg, marginTop: 0 }]}>
            <Text style={[styles.roleChipText, { color: meta.fg }]}>{meta.label}</Text>
          </View>
          <View style={[styles.roleChip, {
            backgroundColor: tier === 'pro' ? '#4A1B0C' : '#f0f0f0', marginTop: 0,
          }]}>
            <Text style={[styles.roleChipText, {
              color: tier === 'pro' ? '#FAECE7' : '#888',
            }]}>
              {isTrial
                ? `Prueba Pro · ${daysLeft} día${daysLeft === 1 ? '' : 's'}`
                : tier === 'pro' ? 'Kahve Pro' : 'Plan Gratis'}
            </Text>
          </View>
        </View>
      </View>

      {/* Estadísticas del turno */}
      <Text style={styles.sectionTitle}>
        {shift
          ? `Turno actual · desde ${new Date(shift.opened_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`
          : 'Sin turno abierto'}
      </Text>
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.orders}</Text>
          <Text style={styles.statLabel}>Órdenes</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>${stats.sold.toFixed(0)}</Text>
          <Text style={styles.statLabel}>Vendido</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.cancelled}</Text>
          <Text style={styles.statLabel}>Cancelaciones</Text>
        </View>
      </View>

      {/* Permisos del rol */}
      {org && (
        <View style={styles.orgCard}>
          <View style={styles.orgIcon}>
            <Ionicons name="storefront-outline" size={20} color="#4A1B0C" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.orgName}>{org.name}</Text>
            <Text style={styles.orgMeta}>
              {branch
                ? `${branch.name}${branch.address ? ` · ${branch.address}` : ''}`
                : 'Todas las sucursales'}
            </Text>
          </View>
        </View>
      )}

      <Text style={styles.sectionTitle}>Permisos de tu rol</Text>
      <View style={styles.permBox}>
        {PERMISSION_LABELS.map(([perm, label]) => {
          const allowed = can(role, perm);
          return (
            <View key={perm} style={styles.permRow}>
              <Ionicons
                name={allowed ? 'checkmark' : 'close'}
                size={16}
                color={allowed ? '#3B6D11' : '#A32D2D'}
              />
              <Text style={[styles.permText, !allowed && { color: '#999' }]}>
                {label}
              </Text>
            </View>
          );
        })}
      </View>

      {/* Acciones */}
      <View style={styles.actions}>
        {employee?.role === 'admin' && (
          <Pressable style={styles.actionRow}
            onPress={() => router.push('/(app)/upgrade')}>
            <Ionicons name="star-outline" size={18} color="#B8860B" />
            <Text style={styles.actionText}>Kahve Pro</Text>
            <Ionicons name="chevron-forward" size={16} color="#bbb" />
          </Pressable>
        )}
        <Pressable style={styles.actionRow}
          onPress={() => router.push('/(app)/printer')}>
          <Ionicons name="print-outline" size={18} color="#666" />
          <Text style={styles.actionText}>Impresora</Text>
          <Ionicons name="chevron-forward" size={16} color="#bbb" />
        </Pressable>
        <Pressable style={styles.actionRow} onPress={() => setShowPin(true)}>
          <Ionicons name="lock-closed-outline" size={18} color="#666" />
          <Text style={styles.actionText}>Cambiar PIN</Text>
          <Ionicons name="chevron-forward" size={16} color="#bbb" />
        </Pressable>
        <Pressable style={styles.actionRow} onPress={openHistory}>
          <Ionicons name="time-outline" size={18} color="#666" />
          <Text style={styles.actionText}>Historial de turnos</Text>
          <Ionicons name="chevron-forward" size={16} color="#bbb" />
        </Pressable>
        <Pressable style={styles.actionRow} onPress={() => router.push('/(app)/shift')}>
          <Ionicons name="cash-outline" size={18} color="#666" />
          <Text style={styles.actionText}>
            {shift ? 'Corte de caja' : 'Abrir turno'}
          </Text>
          <Ionicons name="chevron-forward" size={16} color="#bbb" />
        </Pressable>
        <Pressable style={styles.actionRow}
          onPress={() => router.push('/(app)/privacidad')}>
          <Ionicons name="shield-checkmark-outline" size={18} color="#666" />
          <Text style={styles.actionText}>Aviso de Privacidad</Text>
          <Ionicons name="chevron-forward" size={16} color="#bbb" />
        </Pressable>
        <Pressable style={styles.actionRow}
          onPress={() => router.push('/(app)/terminos')}>
          <Ionicons name="document-text-outline" size={18} color="#666" />
          <Text style={styles.actionText}>Términos de Uso</Text>
          <Ionicons name="chevron-forward" size={16} color="#bbb" />
        </Pressable>
        <Pressable style={styles.actionRow} onPress={handleSignOut}>
          <Ionicons name="log-out-outline" size={18} color="#A32D2D" />
          <Text style={[styles.actionText, { color: '#A32D2D' }]}>Cerrar sesión</Text>
        </Pressable>
      </View>

      {/* Modal: cambiar PIN */}
      <Modal visible={showPin} transparent animationType="slide"
        onRequestClose={() => setShowPin(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1, justifyContent: 'flex-end' }}
        >
        <Pressable style={styles.backdrop} onPress={() => setShowPin(false)} />
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>Cambiar PIN</Text>
          <TextInput placeholderTextColor="#9A9A9A" style={styles.input} placeholder="Nuevo PIN (6 dígitos)"
            keyboardType="number-pad" maxLength={6} secureTextEntry
            value={pin1} onChangeText={setPin1} />
          <TextInput placeholderTextColor="#9A9A9A" style={styles.input} placeholder="Confirma el PIN"
            keyboardType="number-pad" maxLength={6} secureTextEntry
            value={pin2} onChangeText={setPin2} />
          <Pressable
            style={[styles.saveButton, busy && { opacity: 0.6 }]}
            disabled={busy}
            onPress={changePin}>
            <Text style={styles.saveText}>
              {busy ? 'Guardando…' : 'Actualizar PIN'}
            </Text>
          </Pressable>
        </View>
              </KeyboardAvoidingView>
      </Modal>

      {/* Modal: historial de turnos */}
      <Modal visible={showHistory} transparent animationType="slide"
        onRequestClose={() => setShowHistory(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1, justifyContent: 'flex-end' }}
        >
        <Pressable style={styles.backdrop} onPress={() => setShowHistory(false)} />
        <View style={[styles.sheet, { maxHeight: '70%' }]}>
          <Text style={styles.sheetTitle}>Historial de turnos</Text>
          <ScrollView contentContainerStyle={{ gap: 8 }}>
            {history.length === 0 && (
              <Text style={{ color: '#888', fontSize: 13 }}>
                Aún no hay turnos cerrados.
              </Text>
            )}
            {history.map((s) => {
              const diff = Number(s.cash_difference ?? 0);
              return (
                <View key={s.id} style={styles.historyRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.historyDate}>{fmtDate(s.closed_at)}</Text>
                    <Text style={styles.historyMeta}>
                      Contado: ${Number(s.counted_cash ?? 0).toFixed(2)}
                    </Text>
                  </View>
                  <Text style={[
                    styles.historyDiff,
                    { color: diff < 0 ? '#A32D2D' : diff > 0 ? '#854F0B' : '#3B6D11' },
                  ]}>
                    {diff === 0 ? 'Exacto'
                      : `${diff > 0 ? '+' : '−'}$${Math.abs(diff).toFixed(2)}`}
                  </Text>
                </View>
              );
            })}
          </ScrollView>
        </View>
              </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 40, gap: 8, backgroundColor: '#fff' },
  containerWide: { maxWidth: 640, width: '100%', alignSelf: 'center' },
  header: { alignItems: 'center', gap: 4, paddingVertical: 12 },
  avatar: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: '#FAECE7',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 22, fontWeight: '700', color: '#712B13' },
  name: { fontSize: 18, fontWeight: '700', marginTop: 6 },
  email: { fontSize: 12, color: '#888' },
  roleChip: { borderRadius: 20, paddingVertical: 4, paddingHorizontal: 14, marginTop: 4 },
  roleChipText: { fontSize: 12, fontWeight: '700' },
  sectionTitle: { fontSize: 12, color: '#888', marginTop: 10 },
  statsRow: { flexDirection: 'row', gap: 8 },
  statCard: {
    flex: 1, backgroundColor: '#f7f7f7', borderRadius: 12,
    paddingVertical: 12, alignItems: 'center',
  },
  statValue: { fontSize: 17, fontWeight: '700', color: '#222' },
  statLabel: { fontSize: 10, color: '#777', marginTop: 2 },
  permBox: {
    borderWidth: 1, borderColor: '#eee', borderRadius: 12, padding: 12, gap: 8,
  },
  permRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  permText: { fontSize: 13, color: '#333' },
  actions: { marginTop: 6 },
  actionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#f2f2f2',
  },
  actionText: { flex: 1, fontSize: 14, color: '#222' },
  orgCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderColor: '#eee', borderRadius: 14,
    padding: 14, marginBottom: 4,
  },
  orgIcon: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: '#FAECE7',
    alignItems: 'center', justifyContent: 'center',
  },
  orgName: { fontSize: 15, fontWeight: '700', color: '#222' },
  orgMeta: { fontSize: 12, color: '#888', marginTop: 2 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 32, gap: 10,
  },
  sheetTitle: { fontSize: 18, fontWeight: '600', marginBottom: 4 },
  input: {
    color: '#1F1F1F',
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 16,
  },
  saveButton: {
    backgroundColor: '#4A1B0C', borderRadius: 10,
    paddingVertical: 14, alignItems: 'center', marginTop: 4,
  },
  saveText: { color: '#FAECE7', fontSize: 15, fontWeight: '600' },
  historyRow: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: '#eee', borderRadius: 10, padding: 12,
  },
  historyDate: { fontSize: 13, fontWeight: '600', color: '#222' },
  historyMeta: { fontSize: 12, color: '#777', marginTop: 2 },
  historyDiff: { fontSize: 13, fontWeight: '700' },
});

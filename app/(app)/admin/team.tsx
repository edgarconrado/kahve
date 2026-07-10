import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../lib/auth';
import { can, type Permission } from '../../../lib/permissions';
import type { Employee, EmployeeRole } from '../../../types/db';

interface Branch { id: string; name: string }

const ROLE_META: Record<EmployeeRole, { label: string; bg: string; fg: string }> = {
  admin:      { label: 'Admin',      bg: '#FAEEDA', fg: '#854F0B' },
  supervisor: { label: 'Supervisor', bg: '#EEEDFE', fg: '#534AB7' },
  cajero:     { label: 'Cajero',     bg: '#E6F1FB', fg: '#185FA5' },
  barista:    { label: 'Barista',    bg: '#E1F5EE', fg: '#0F6E56' },
};
const ALL_ROLES: EmployeeRole[] = ['barista', 'cajero', 'supervisor', 'admin'];
const CREATE_ROLES: EmployeeRole[] = ['barista', 'cajero', 'supervisor'];

// Matriz de permisos del mockup: permiso × rol
const MATRIX: [Permission, string][] = [
  ['queue.view',    'Ver cola de preparación'],
  ['pos.sell',      'Cobrar órdenes'],
  ['orders.cancel', 'Cancelar / reembolsar'],
  ['reports.view',  'Ver reportes'],
  ['menu.edit',     'Editar menú y precios'],
  ['team.manage',   'Gestionar empleados'],
];
const MATRIX_ROLES: { role: EmployeeRole; short: string }[] = [
  { role: 'barista', short: 'Bar.' },
  { role: 'cajero', short: 'Caj.' },
  { role: 'supervisor', short: 'Sup.' },
  { role: 'admin', short: 'Adm.' },
];

export default function Team() {
  const { employee: me } = useAuth();
  const [team, setTeam] = useState<Employee[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<Employee | null>(null);

  // Formulario de alta
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [role, setRole] = useState<EmployeeRole>('barista');
  const [branchId, setBranchId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    supabase
      .from('employees')
      .select('*')
      .eq('is_active', true)
      .order('full_name')
      .then(({ data }) => setTeam(data ?? []));
    supabase
      .from('branches')
      .select('id, name')
      .eq('is_active', true)
      .then(({ data }) => {
        setBranches(data ?? []);
        if (data?.length === 1) setBranchId(data[0].id);
      });
  }, []);

  useFocusEffect(load);

  // ---- Alta de empleado (Edge Function) ----
  const missing = [
    !fullName.trim() && 'nombre',
    !email.trim() && 'correo',
    !/^\d{6}$/.test(pin) && 'PIN de 6 dígitos',
    !branchId && 'sucursal',
  ].filter(Boolean) as string[];
  const canSave = missing.length === 0 && !busy;

  const save = async () => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('create-employee', {
      body: { fullName, email, pin, role, branchId },
    });
    setBusy(false);

    let failure: string | null = data?.error ?? null;
    if (error instanceof FunctionsHttpError) {
      const raw = await error.context.text();
      try {
        const parsed = JSON.parse(raw);
        failure = parsed.error ?? parsed.message ?? raw;
      } catch { failure = raw || error.message; }
    } else if (error) {
      failure = error.message;
    }
    if (failure) { Alert.alert('No se pudo crear', failure); return; }
    if (!data?.ok || !data?.employee) {
      Alert.alert('Respuesta inesperada', 'La función no confirmó la creación.');
      return;
    }
    setShowForm(false);
    setFullName(''); setEmail(''); setPin(''); setRole('barista');
    load();
    Alert.alert('Empleado creado', `${data.employee.full_name} ya puede entrar.`);
  };

  // ---- Cambio de rol / desactivación ----
  const changeRole = async (target: Employee, newRole: EmployeeRole) => {
    if (newRole === target.role) return;
    // El constraint exige sucursal para roles operativos
    if (newRole !== 'admin' && !target.branch_id) {
      Alert.alert('Falta sucursal',
        'Asigna una sucursal a este empleado antes de darle un rol operativo.');
      return;
    }
    const { error } = await supabase
      .from('employees').update({ role: newRole }).eq('id', target.id);
    if (error) { Alert.alert('Error', error.message); return; }
    setEditTarget(null);
    load();
  };

  const deactivate = (target: Employee) => {
    Alert.alert(
      `Desactivar a ${target.full_name}`,
      'No podrá iniciar sesión ni aparecerá en el equipo. Sus ventas históricas se conservan.',
      [
        { text: 'Conservar', style: 'cancel' },
        {
          text: 'Desactivar', style: 'destructive',
          onPress: async () => {
            const { error } = await supabase
              .from('employees').update({ is_active: false }).eq('id', target.id);
            if (error) { Alert.alert('Error', error.message); return; }
            setEditTarget(null);
            load();
          },
        },
      ],
    );
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#fff' }}
      contentContainerStyle={{ padding: 16, paddingBottom: 96, gap: 8 }}>

      <Text style={styles.sectionTitle}>Empleados activos ({team.length})</Text>
      {team.map((item) => {
        const meta = ROLE_META[item.role];
        const isMe = item.id === me?.id;
        return (
          <Pressable key={item.id} style={styles.card}
            onPress={() => !isMe && setEditTarget(item)}>
            <View style={[styles.avatar, { backgroundColor: meta.bg }]}>
              <Text style={[styles.avatarText, { color: meta.fg }]}>
                {item.full_name.slice(0, 2).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.full_name}</Text>
              <Text style={styles.email}>
                {isMe ? 'Sesión activa' : item.email}
              </Text>
            </View>
            <View style={[styles.roleChip, { backgroundColor: meta.bg }]}>
              <Text style={[styles.roleChipText, { color: meta.fg }]}>
                {meta.label}
              </Text>
            </View>
            {!isMe && (
              <Ionicons name="ellipsis-vertical" size={16} color="#bbb" />
            )}
          </Pressable>
        );
      })}

      {/* Matriz de permisos por rol */}
      <Text style={[styles.sectionTitle, { marginTop: 12 }]}>Permisos por rol</Text>
      <View style={styles.matrixBox}>
        <View style={styles.matrixHeader}>
          <Text style={[styles.matrixPermHead, { flex: 1 }]}>Permiso</Text>
          {MATRIX_ROLES.map((r) => (
            <Text key={r.role}
              style={[styles.matrixRoleHead, { color: ROLE_META[r.role].fg }]}>
              {r.short}
            </Text>
          ))}
        </View>
        {MATRIX.map(([perm, label]) => (
          <View key={perm} style={styles.matrixRow}>
            <Text style={styles.matrixPerm}>{label}</Text>
            {MATRIX_ROLES.map((r) => (
              <View key={r.role} style={styles.matrixCell}>
                {can(r.role, perm)
                  ? <Ionicons name="checkmark" size={14} color="#3B6D11" />
                  : <Text style={styles.matrixDash}>—</Text>}
              </View>
            ))}
          </View>
        ))}
      </View>

      {/* FAB de alta */}
      <Pressable style={styles.fab} onPress={() => setShowForm(true)}>
        <Ionicons name="person-add" size={22} color="#FAECE7" />
      </Pressable>

      {/* Modal: editar empleado (rol / desactivar) */}
      <Modal visible={editTarget !== null} transparent animationType="slide"
        onRequestClose={() => setEditTarget(null)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1, justifyContent: 'flex-end' }}
        >
        <Pressable style={styles.backdrop} onPress={() => setEditTarget(null)} />
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>{editTarget?.full_name}</Text>
          <Text style={styles.label}>Rol</Text>
          <View style={styles.chipRow}>
            {ALL_ROLES.map((r) => {
              const meta = ROLE_META[r];
              const isCurrent = editTarget?.role === r;
              return (
                <Pressable key={r}
                  style={[styles.chip, isCurrent && {
                    backgroundColor: meta.bg, borderColor: meta.fg,
                  }]}
                  onPress={() => editTarget && changeRole(editTarget, r)}>
                  <Text style={[styles.chipText,
                    isCurrent && { color: meta.fg, fontWeight: '700' }]}>
                    {meta.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.hint}>
            El cambio de rol aplica en el siguiente inicio de sesión del empleado.
          </Text>
          <Pressable style={styles.deactivateButton}
            onPress={() => editTarget && deactivate(editTarget)}>
            <Ionicons name="person-remove-outline" size={16} color="#A32D2D" />
            <Text style={styles.deactivateText}>Desactivar empleado</Text>
          </Pressable>
        </View>
              </KeyboardAvoidingView>
      </Modal>

      {/* Modal: nuevo empleado */}
      <Modal visible={showForm} transparent animationType="slide"
        onRequestClose={() => setShowForm(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1, justifyContent: 'flex-end' }}
        >
        <Pressable style={styles.backdrop} onPress={() => setShowForm(false)} />
        <View style={[styles.sheet, { maxHeight: '80%' }]}>
          <Text style={styles.sheetTitle}>Nuevo empleado</Text>
          <ScrollView contentContainerStyle={{ gap: 10 }}>
            <TextInput style={styles.input} placeholder="Nombre completo"
              value={fullName} onChangeText={setFullName} />
            <TextInput style={styles.input} placeholder="Correo"
              autoCapitalize="none" keyboardType="email-address"
              value={email} onChangeText={setEmail} />
            <TextInput style={styles.input} placeholder="PIN (6 dígitos)"
              keyboardType="number-pad" maxLength={6} secureTextEntry
              value={pin} onChangeText={setPin} />
            <Text style={styles.label}>Rol</Text>
            <View style={styles.chipRow}>
              {CREATE_ROLES.map((r) => (
                <Pressable key={r}
                  style={[styles.chip, role === r && styles.chipOn]}
                  onPress={() => setRole(r)}>
                  <Text style={[styles.chipText, role === r && styles.chipTextOn]}>
                    {ROLE_META[r].label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.label}>Sucursal</Text>
            <View style={styles.chipRow}>
              {branches.map((b) => (
                <Pressable key={b.id}
                  style={[styles.chip, branchId === b.id && styles.chipOn]}
                  onPress={() => setBranchId(b.id)}>
                  <Text style={[styles.chipText,
                    branchId === b.id && styles.chipTextOn]}>{b.name}</Text>
                </Pressable>
              ))}
            </View>
            {missing.length > 0 && (
              <Text style={styles.missing}>Falta: {missing.join(', ')}</Text>
            )}
            <Pressable
              style={[styles.saveButton, !canSave && { opacity: 0.5 }]}
              disabled={!canSave}
              onPress={save}>
              <Text style={styles.saveText}>
                {busy ? 'Creando…' : 'Crear empleado'}
              </Text>
            </Pressable>
          </ScrollView>
        </View>
              </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { fontSize: 12, color: '#888' },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderColor: '#eee', borderRadius: 14, padding: 12,
  },
  avatar: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 13, fontWeight: '700' },
  name: { fontSize: 14, fontWeight: '600', color: '#222' },
  email: { fontSize: 11, color: '#888', marginTop: 1 },
  roleChip: { borderRadius: 12, paddingVertical: 4, paddingHorizontal: 10 },
  roleChipText: { fontSize: 11, fontWeight: '700' },
  matrixBox: { borderWidth: 1, borderColor: '#eee', borderRadius: 12, padding: 12 },
  matrixHeader: {
    flexDirection: 'row', alignItems: 'center', paddingBottom: 8,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  matrixPermHead: { fontSize: 11, color: '#999' },
  matrixRoleHead: { width: 40, fontSize: 11, fontWeight: '700', textAlign: 'center' },
  matrixRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 7,
    borderBottomWidth: 1, borderBottomColor: '#f6f6f6',
  },
  matrixPerm: { flex: 1, fontSize: 12, color: '#333' },
  matrixCell: { width: 40, alignItems: 'center' },
  matrixDash: { fontSize: 12, color: '#ccc' },
  fab: {
    position: 'absolute', right: 20, bottom: 24, width: 56, height: 56,
    borderRadius: 28, backgroundColor: '#4A1B0C',
    alignItems: 'center', justifyContent: 'center', elevation: 4,
  },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 32, gap: 10,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700' },
  label: { fontSize: 12, color: '#888' },
  chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 20,
    paddingVertical: 8, paddingHorizontal: 16,
  },
  chipOn: { borderColor: '#4A1B0C', backgroundColor: '#FAECE7' },
  chipText: { fontSize: 13, color: '#444' },
  chipTextOn: { color: '#4A1B0C', fontWeight: '600' },
  hint: { fontSize: 11, color: '#999' },
  deactivateButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1, borderColor: '#A32D2D', borderRadius: 10,
    paddingVertical: 12, marginTop: 6,
  },
  deactivateText: { color: '#A32D2D', fontWeight: '600', fontSize: 13 },
  missing: { fontSize: 12, color: '#A32D2D' },
  input: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 15,
  },
  saveButton: {
    backgroundColor: '#4A1B0C', borderRadius: 10,
    paddingVertical: 14, alignItems: 'center', marginTop: 4,
  },
  saveText: { color: '#FAECE7', fontSize: 15, fontWeight: '600' },
});

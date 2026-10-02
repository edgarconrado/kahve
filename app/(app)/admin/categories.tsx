import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import {
  Alert, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../lib/auth';

interface Category {
  id: string;
  name: string;
  sort_order: number;
  productCount: number;
}

export default function Categories() {
  const { employee } = useAuth();
  const { width } = useWindowDimensions();
  const isWide = width >= 700;
  const [categories, setCategories] = useState<Category[]>([]);
  const [busy, setBusy] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [name, setName] = useState('');

  // Al borrar una categoría con productos, primero hay que moverlos a otra
  // — nunca se deja un producto apuntando a una categoría inactiva.
  const [showReassign, setShowReassign] = useState(false);
  const [toDelete, setToDelete] = useState<Category | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: cats } = await supabase
      .from('product_categories')
      .select('id, name, sort_order')
      .eq('is_active', true)
      .order('sort_order');
    const { data: prods } = await supabase
      .from('products')
      .select('category_id')
      .eq('is_active', true);
    const counts: Record<string, number> = {};
    (prods ?? []).forEach((p: any) => {
      if (!p.category_id) return;
      counts[p.category_id] = (counts[p.category_id] ?? 0) + 1;
    });
    setCategories(
      (cats ?? []).map((c) => ({ ...c, productCount: counts[c.id] ?? 0 })),
    );
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const resolveBranch = async (): Promise<string | null> => {
    if (employee?.branch_id) return employee.branch_id;
    const { data } = await supabase
      .from('branches').select('id').eq('is_active', true).limit(1).single();
    return data?.id ?? null;
  };

  const openCreate = () => { setEditing(null); setName(''); setShowForm(true); };
  const openEdit = (c: Category) => { setEditing(c); setName(c.name); setShowForm(true); };

  const save = async () => {
    if (!employee || !name.trim()) return;
    setBusy(true);
    if (editing) {
      const { error } = await supabase
        .from('product_categories')
        .update({ name: name.trim() })
        .eq('id', editing.id);
      if (error) {
        setBusy(false);
        Alert.alert('Error', error.message);
        return;
      }
    } else {
      const branchId = await resolveBranch();
      if (!branchId) {
        setBusy(false);
        Alert.alert('Sin sucursal', 'No hay sucursales activas.');
        return;
      }
      const { error } = await supabase.from('product_categories').insert({
        organization_id: employee.organization_id,
        branch_id: branchId,
        name: name.trim(),
        sort_order: categories.length,
      });
      if (error) {
        setBusy(false);
        Alert.alert('Error', error.message);
        return;
      }
    }
    setBusy(false);
    setShowForm(false);
    load();
  };

  // Reordenar: intercambia el sort_order con el vecino de arriba/abajo.
  const move = async (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= categories.length) return;
    const a = categories[index];
    const b = categories[target];
    const next = [...categories];
    [next[index], next[target]] = [next[target], next[index]];
    setCategories(next);
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase.from('product_categories').update({ sort_order: b.sort_order }).eq('id', a.id),
      supabase.from('product_categories').update({ sort_order: a.sort_order }).eq('id', b.id),
    ]);
    if (e1 || e2) {
      Alert.alert('Error', 'No se pudo reordenar.');
      load();
    }
  };

  const requestDelete = (c: Category) => {
    if (c.productCount === 0) {
      Alert.alert(
        'Eliminar categoría',
        `¿Eliminar "${c.name}"? No tiene productos.`,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Eliminar', style: 'destructive', onPress: () => deactivate(c) },
        ],
      );
      return;
    }
    if (categories.length <= 1) {
      Alert.alert(
        'No se puede eliminar',
        'Es tu única categoría. Crea otra antes de borrar esta.',
      );
      return;
    }
    setToDelete(c);
    setTargetId(categories.find((x) => x.id !== c.id)?.id ?? null);
    setShowReassign(true);
  };

  const deactivate = async (c: Category) => {
    const { error } = await supabase
      .from('product_categories').update({ is_active: false }).eq('id', c.id);
    if (error) { Alert.alert('Error', error.message); return; }
    load();
  };

  const confirmReassignAndDelete = async () => {
    if (!toDelete || !targetId) return;
    setBusy(true);
    const { error: moveError } = await supabase
      .from('products')
      .update({ category_id: targetId })
      .eq('category_id', toDelete.id);
    if (moveError) {
      setBusy(false);
      Alert.alert('Error', moveError.message);
      return;
    }
    const { error } = await supabase
      .from('product_categories').update({ is_active: false }).eq('id', toDelete.id);
    setBusy(false);
    if (error) { Alert.alert('Error', error.message); return; }
    setShowReassign(false);
    setToDelete(null);
    load();
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <View style={styles.screenHeader}>
        <Pressable onPress={() => router.push('/(app)/admin')} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color="#4A1B0C" />
        </Pressable>
        <Text style={styles.screenHeaderTitle}>Categorías</Text>
        <View style={{ width: 22 }} />
      </View>
      <FlatList
        data={categories}
        keyExtractor={(c) => c.id}
        contentContainerStyle={[
          { padding: 16, gap: 8, paddingBottom: 96 },
          isWide && { maxWidth: 640, width: '100%', alignSelf: 'center' },
        ]}
        renderItem={({ item, index }) => (
          <View style={styles.card}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.meta}>
                {item.productCount} producto{item.productCount === 1 ? '' : 's'}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 4 }}>
              <Pressable
                hitSlop={6}
                style={styles.iconButton}
                disabled={index === 0}
                onPress={() => move(index, -1)}
              >
                <Ionicons name="chevron-up" size={18} color={index === 0 ? '#ddd' : '#4A1B0C'} />
              </Pressable>
              <Pressable
                hitSlop={6}
                style={styles.iconButton}
                disabled={index === categories.length - 1}
                onPress={() => move(index, 1)}
              >
                <Ionicons
                  name="chevron-down"
                  size={18}
                  color={index === categories.length - 1 ? '#ddd' : '#4A1B0C'}
                />
              </Pressable>
              <Pressable hitSlop={6} style={styles.iconButton} onPress={() => openEdit(item)}>
                <Ionicons name="pencil-outline" size={18} color="#4A1B0C" />
              </Pressable>
              <Pressable hitSlop={6} style={styles.iconButton} onPress={() => requestDelete(item)}>
                <Ionicons name="trash-outline" size={18} color="#A32D2D" />
              </Pressable>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <Text style={{ color: '#888', textAlign: 'center', marginTop: 40 }}>
            Aún no tienes categorías. Créalas aquí o desde Menú al agregar un producto.
          </Text>
        }
      />

      <Pressable style={styles.fab} onPress={openCreate}>
        <Ionicons name="add" size={26} color="#FAECE7" />
      </Pressable>

      <Modal visible={showForm} transparent animationType="slide"
        onRequestClose={() => setShowForm(false)}>
        <Pressable style={styles.backdrop} onPress={() => setShowForm(false)} />
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>
            {editing ? 'Editar categoría' : 'Nueva categoría'}
          </Text>
          <TextInput
            placeholderTextColor="#9A9A9A"
            style={styles.input}
            placeholder="Nombre de la categoría"
            value={name}
            onChangeText={setName}
            autoFocus
          />
          <Pressable
            style={[styles.saveButton, (!name.trim() || busy) && { opacity: 0.5 }]}
            disabled={!name.trim() || busy}
            onPress={save}
          >
            <Text style={styles.saveText}>
              {busy ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear categoría'}
            </Text>
          </Pressable>
        </View>
      </Modal>

      <Modal visible={showReassign} transparent animationType="slide"
        onRequestClose={() => setShowReassign(false)}>
        <Pressable style={styles.backdrop} onPress={() => setShowReassign(false)} />
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>Mover productos y eliminar</Text>
          <Text style={{ fontSize: 13, color: '#666' }}>
            "{toDelete?.name}" tiene {toDelete?.productCount} producto
            {toDelete?.productCount === 1 ? '' : 's'}. Elige a dónde moverlos antes de
            eliminar la categoría:
          </Text>
          <View style={{ gap: 8, marginTop: 4 }}>
            {categories.filter((c) => c.id !== toDelete?.id).map((c) => (
              <Pressable
                key={c.id}
                style={[styles.targetChip, targetId === c.id && styles.targetChipOn]}
                onPress={() => setTargetId(c.id)}
              >
                <Text style={[
                  styles.targetChipText,
                  targetId === c.id && styles.targetChipTextOn,
                ]}>
                  {c.name}
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable
            style={[styles.saveButton, (!targetId || busy) && { opacity: 0.5 }]}
            disabled={!targetId || busy}
            onPress={confirmReassignAndDelete}
          >
            <Text style={styles.saveText}>
              {busy ? 'Moviendo…' : 'Mover productos y eliminar categoría'}
            </Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screenHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 54, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  screenHeaderTitle: { fontSize: 16, fontWeight: '700', color: '#222' },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderColor: '#eee', borderRadius: 14, padding: 14,
  },
  name: { fontSize: 15, fontWeight: '600' },
  meta: { fontSize: 12, color: '#666', marginTop: 2 },
  iconButton: {
    width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
  },
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
  sheetTitle: { fontSize: 18, fontWeight: '600', marginBottom: 4 },
  input: {
    color: '#1F1F1F',
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 15,
  },
  saveButton: {
    backgroundColor: '#4A1B0C', borderRadius: 10,
    paddingVertical: 14, alignItems: 'center', marginTop: 8,
  },
  saveText: { color: '#FAECE7', fontSize: 15, fontWeight: '600' },
  targetChip: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
    paddingVertical: 10, paddingHorizontal: 14,
  },
  targetChipOn: { borderColor: '#4A1B0C', backgroundColor: '#FAECE7' },
  targetChipText: { fontSize: 14, color: '#444' },
  targetChipTextOn: { color: '#4A1B0C', fontWeight: '700' },
});

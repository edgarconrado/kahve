import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Switch,
  Text, TextInput, View, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { Image } from 'react-native';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../lib/auth';
import { usePlan, proFeatureAlert } from '../../../lib/plan';
import type { Modifier, Product } from '../../../types/db';

interface Category { id: string; name: string }
type ProductFull = Product & { modifiers: Modifier[] };

export default function Menu() {
  const { employee } = useAuth();
  const { tier } = usePlan(employee);
  const [products, setProducts] = useState<ProductFull[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [editing, setEditing] = useState<ProductFull | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Formulario
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [newCategory, setNewCategory] = useState('');
  const [modifiers, setModifiers] = useState<{ id?: string; name: string; price: string }[]>([]);
  const [imageUri, setImageUri] = useState<string | null>(null);      // preview local
  const [imageBase64, setImageBase64] = useState<string | null>(null); // pendiente de subir
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    supabase
      .from('products')
      .select('*, modifiers(*)')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => setProducts((data as ProductFull[]) ?? []));
    supabase
      .from('product_categories')
      .select('id, name')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => setCategories(data ?? []));
  }, []);

  useFocusEffect(load);

  const openCreate = () => {
    setEditing(null);
    setName(''); setPrice(''); setDescription('');
    setCategoryId(categories[0]?.id ?? null); setNewCategory('');
    setModifiers([]);
    setImageUri(null); setImageBase64(null);
    setShowForm(true);
  };

  const openEdit = (p: ProductFull) => {
    setEditing(p);
    setName(p.name);
    setPrice(String(p.base_price));
    setDescription(p.description ?? '');
    setCategoryId(p.category_id); setNewCategory('');
    setModifiers(
      (p.modifiers ?? [])
        .filter((m) => m.is_active !== false)
        .map((m) => ({ id: m.id, name: m.name, price: String(m.price_delta) })),
    );
    setImageUri(p.image_url); setImageBase64(null);
    setShowForm(true);
  };

  const pickImage = async () => {
    if (tier === 'free') {
      proFeatureAlert('Agregar fotos a tus productos');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
      setImageBase64(result.assets[0].base64 ?? null);
    }
  };

  // Sucursal de trabajo: la del empleado, o la primera de la org (admin)
  const resolveBranch = async (): Promise<string | null> => {
    if (employee?.branch_id) return employee.branch_id;
    const { data } = await supabase
      .from('branches').select('id').eq('is_active', true).limit(1).single();
    return data?.id ?? null;
  };

  const canSave = name.trim() && parseFloat(price) >= 0
    && (categoryId || newCategory.trim()) && !busy;

  const save = async () => {
    if (!employee) return;
    setBusy(true);
    const branchId = await resolveBranch();
    if (!branchId) {
      setBusy(false);
      Alert.alert('Sin sucursal', 'No hay sucursales activas.');
      return;
    }

    // Categoría: usar la elegida o crear la nueva
    let finalCategoryId = categoryId;
    if (newCategory.trim()) {
      const { data: cat, error } = await supabase
        .from('product_categories')
        .insert({
          organization_id: employee.organization_id,
          branch_id: branchId,
          name: newCategory.trim(),
          sort_order: categories.length,
        })
        .select('id')
        .single();
      if (error || !cat) {
        setBusy(false);
        Alert.alert('Error', `No se pudo crear la categoría: ${error?.message}`);
        return;
      }
      finalCategoryId = cat.id;
    }

    // Subir la foto nueva (si se eligió una) a Supabase Storage
    let imageUrl: string | null | undefined = undefined; // undefined = no tocar
    if (imageBase64) {
      const filePath = `${employee.organization_id}/${Date.now()}.jpg`;
      const { error: upError } = await supabase.storage
        .from('product-images')
        .upload(filePath, decode(imageBase64), { contentType: 'image/jpeg' });
      if (upError) {
        setBusy(false);
        Alert.alert('Error al subir la foto', upError.message);
        return;
      }
      imageUrl = supabase.storage
        .from('product-images').getPublicUrl(filePath).data.publicUrl;
    }

    const payload = {
      ...(imageUrl !== undefined ? { image_url: imageUrl } : {}),
      name: name.trim(),
      description: description.trim() || null,
      base_price: parseFloat(price),
      category_id: finalCategoryId,
    };

    let productId = editing?.id ?? null;
    if (editing) {
      const { error } = await supabase
        .from('products').update(payload).eq('id', editing.id);
      if (error) {
        setBusy(false);
        Alert.alert('Error', `No se pudo actualizar: ${error.message}`);
        return;
      }
    } else {
      const { data: created, error } = await supabase
        .from('products')
        .insert({
          ...payload,
          organization_id: employee.organization_id,
          branch_id: branchId,
          sort_order: products.length,
        })
        .select('id')
        .single();
      if (error || !created) {
        setBusy(false);
        Alert.alert('Error', `No se pudo crear: ${error?.message}`);
        return;
      }
      productId = created.id;
    }

    // Modificadores: sincronizar (borrar los quitados, upsert los presentes)
    if (productId) {
      const keepIds = modifiers.filter((m) => m.id).map((m) => m.id);
      const previous = editing?.modifiers ?? [];
      const removed = previous.filter((m) => !keepIds.includes(m.id));
      if (removed.length > 0) {
        await supabase.from('modifiers')
          .delete().in('id', removed.map((m) => m.id));
      }
      for (const m of modifiers) {
        if (!m.name.trim()) continue;
        const row = {
          product_id: productId,
          name: m.name.trim(),
          price_delta: parseFloat(m.price) || 0,
        };
        if (m.id) {
          await supabase.from('modifiers').update(row).eq('id', m.id);
        } else {
          await supabase.from('modifiers').insert(row);
        }
      }
    }

    setBusy(false);
    setShowForm(false);
    load();
  };

  const toggleAvailable = async (product: ProductFull) => {
    setProducts((ps) => ps.map((p) =>
      p.id === product.id ? { ...p, is_available: !p.is_available } : p));
    const { error } = await supabase
      .from('products')
      .update({ is_available: !product.is_available })
      .eq('id', product.id);
    if (error) {
      Alert.alert('Error', error.message);
      load();
    }
  };

  const categoryName = (id: string) =>
    categories.find((c) => c.id === id)?.name ?? '';

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <FlatList
        data={products}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 96 }}
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => openEdit(item)}>
            {item.image_url ? (
              <Image source={{ uri: item.image_url }} style={styles.thumb} />
            ) : null}
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.meta}>
                ${Number(item.base_price).toFixed(2)} · {categoryName(item.category_id)}
                {item.modifiers?.length
                  ? ` · ${item.modifiers.length} modificadores` : ''}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 2 }}>
              <Switch
                value={item.is_available}
                onValueChange={() => toggleAvailable(item)}
                trackColor={{ true: '#1D9E75' }}
              />
              <Text style={[
                styles.availability,
                { color: item.is_available ? '#3B6D11' : '#A32D2D' },
              ]}>
                {item.is_available ? 'Disponible' : 'Agotado'}
              </Text>
            </View>
          </Pressable>
        )}
      />

      <Pressable style={styles.fab} onPress={openCreate}>
        <Ionicons name="add" size={26} color="#FAECE7" />
      </Pressable>

      <Modal visible={showForm} transparent animationType="slide"
        onRequestClose={() => setShowForm(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1, justifyContent: 'flex-end' }}
        >
        <Pressable style={styles.backdrop} onPress={() => setShowForm(false)} />
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>
            {editing ? `Editar: ${editing.name}` : 'Nuevo producto'}
          </Text>
          <ScrollView contentContainerStyle={{ gap: 10 }}>
            <Pressable style={styles.imagePicker} onPress={pickImage}>
              {imageUri ? (
                <Image source={{ uri: imageUri }} style={styles.imagePreview} />
              ) : (
                <View style={styles.imagePlaceholder}>
                  <Ionicons
                    name={tier === 'free' ? 'lock-closed' : 'camera-outline'}
                    size={22} color="#999" />
                </View>
              )}
              <Text style={[styles.imagePickerText, tier === 'free' && { color: '#999' }]}>
                {imageUri ? 'Cambiar foto'
                  : tier === 'free' ? 'Fotos de productos (Pro)' : 'Agregar foto (opcional)'}
              </Text>
            </Pressable>
            <TextInput style={styles.input} placeholder="Nombre"
              value={name} onChangeText={setName} />
            <TextInput style={styles.input} placeholder="Precio base"
              keyboardType="decimal-pad" value={price} onChangeText={setPrice} />
            <TextInput style={styles.input} placeholder="Descripción (opcional)"
              value={description} onChangeText={setDescription} />

            <Text style={styles.label}>Categoría</Text>
            <View style={styles.chipRow}>
              {categories.map((c) => (
                <Pressable key={c.id}
                  style={[styles.chip, categoryId === c.id && !newCategory && styles.chipOn]}
                  onPress={() => { setCategoryId(c.id); setNewCategory(''); }}>
                  <Text style={[
                    styles.chipText,
                    categoryId === c.id && !newCategory && styles.chipTextOn,
                  ]}>{c.name}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput style={styles.input} placeholder="…o escribe una categoría nueva"
              value={newCategory} onChangeText={setNewCategory} />

            <Text style={styles.label}>Modificadores</Text>
            {modifiers.map((m, i) => (
              <View key={m.id ?? `new-${i}`} style={styles.modRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="Nombre (ej. Tamaño grande)"
                  value={m.name}
                  onChangeText={(v) => setModifiers((ms) =>
                    ms.map((x, j) => (j === i ? { ...x, name: v } : x)))}
                />
                <TextInput
                  style={[styles.input, { width: 80 }]}
                  placeholder="+$"
                  keyboardType="decimal-pad"
                  value={m.price}
                  onChangeText={(v) => setModifiers((ms) =>
                    ms.map((x, j) => (j === i ? { ...x, price: v } : x)))}
                />
                <Pressable hitSlop={8}
                  onPress={() => setModifiers((ms) => ms.filter((_, j) => j !== i))}>
                  <Ionicons name="trash-outline" size={20} color="#A32D2D" />
                </Pressable>
              </View>
            ))}
            <Pressable
              style={styles.addModifier}
              onPress={() => setModifiers((ms) => [...ms, { name: '', price: '' }])}>
              <Ionicons name="add" size={16} color="#4A1B0C" />
              <Text style={styles.addModifierText}>Agregar modificador</Text>
            </Pressable>

            <Pressable
              style={[styles.saveButton, !canSave && { opacity: 0.5 }]}
              disabled={!canSave}
              onPress={save}>
              <Text style={styles.saveText}>
                {busy ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear producto'}
              </Text>
            </Pressable>
          </ScrollView>
        </View>
              </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderColor: '#eee', borderRadius: 14, padding: 14,
  },
  thumb: { width: 40, height: 40, borderRadius: 10 },
  imagePicker: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  imagePreview: { width: 56, height: 56, borderRadius: 12 },
  imagePlaceholder: {
    width: 56, height: 56, borderRadius: 12, borderWidth: 1,
    borderColor: '#ddd', borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center',
  },
  imagePickerText: { fontSize: 13, color: '#4A1B0C', fontWeight: '600' },
  name: { fontSize: 15, fontWeight: '600' },
  meta: { fontSize: 12, color: '#666', marginTop: 2 },
  availability: { fontSize: 10, fontWeight: '600' },
  fab: {
    position: 'absolute', right: 20, bottom: 24, width: 56, height: 56,
    borderRadius: 28, backgroundColor: '#4A1B0C',
    alignItems: 'center', justifyContent: 'center', elevation: 4,
  },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 32, maxHeight: '85%',
  },
  sheetTitle: { fontSize: 18, fontWeight: '600', marginBottom: 12 },
  input: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 15,
  },
  label: { fontSize: 12, color: '#888', marginTop: 4 },
  chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 20,
    paddingVertical: 7, paddingHorizontal: 14,
  },
  chipOn: { borderColor: '#4A1B0C', backgroundColor: '#FAECE7' },
  chipText: { fontSize: 13, color: '#444' },
  chipTextOn: { color: '#4A1B0C', fontWeight: '600' },
  modRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  addModifier: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4,
  },
  addModifierText: { color: '#4A1B0C', fontSize: 13, fontWeight: '600' },
  saveButton: {
    backgroundColor: '#4A1B0C', borderRadius: 10,
    paddingVertical: 14, alignItems: 'center', marginTop: 8,
  },
  saveText: { color: '#FAECE7', fontSize: 15, fontWeight: '600' },
});

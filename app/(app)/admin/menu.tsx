import { useCallback, useMemo, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import {
  Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Switch,
  Text, TextInput, View, KeyboardAvoidingView, Platform, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { Image } from 'react-native';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../lib/auth';
import { usePlan, proFeatureAlert, HIDE_PRO_UI } from '../../../lib/plan';
import type { Modifier, Product } from '../../../types/db';
import RecipeEditor from '../../../components/RecipeEditor';

interface Category { id: string; name: string }
type ProductFull = Product & { modifiers: Modifier[] };

export default function Menu() {
  const { employee } = useAuth();
  const { tier } = usePlan(employee);
  const { width } = useWindowDimensions();
  const isWide = width >= 700;
  const [products, setProducts] = useState<ProductFull[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState('');
  const [filterCategoryId, setFilterCategoryId] = useState<string | null>(null);
  type SortKey = 'name' | 'price_asc' | 'price_desc';
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [editing, setEditing] = useState<ProductFull | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Formulario
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [newCategory, setNewCategory] = useState('');
  const [modifiers, setModifiers] = useState<
    { id?: string; name: string; price: string; supplyId: string | null; supplyQty: string }[]
  >([]);
  const [supplies, setSupplies] = useState<{ id: string; name: string; unit: string }[]>([]);
  const [pickerForIndex, setPickerForIndex] = useState<number | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);      // preview local
  const [imageBase64, setImageBase64] = useState<string | null>(null); // pendiente de subir
  const [recipeLines, setRecipeLines] = useState<
    { supply_id: string; quantity_used: number }[]
  >([]);
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
    supabase
      .from('supplies')
      .select('id, name, unit')
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => setSupplies(data ?? []));
  }, []);

  useFocusEffect(load);

  const openCreate = () => {
    setEditing(null);
    setName(''); setPrice(''); setDescription('');
    setCategoryId(categories[0]?.id ?? null); setNewCategory('');
    setModifiers([]);
    setImageUri(null); setImageBase64(null);
    setRecipeLines([]);
    setShowForm(true);
  };

  const openEdit = async (p: ProductFull) => {
    setEditing(p);
    setName(p.name);
    setPrice(String(p.base_price));
    setDescription(p.description ?? '');
    setCategoryId(p.category_id); setNewCategory('');
    const activeModifiers = (p.modifiers ?? []).filter((m) => m.is_active !== false);

    // Insumo asignado a cada modificador (si tiene)
    const modifierIds = activeModifiers.map((m) => m.id);
    let supplyByModifier: Record<string, { supply_id: string; quantity_used: number }> = {};
    if (modifierIds.length > 0) {
      const { data: ms } = await supabase
        .from('modifier_supplies')
        .select('modifier_id, supply_id, quantity_used')
        .in('modifier_id', modifierIds);
      (ms ?? []).forEach((row: any) => {
        supplyByModifier[row.modifier_id] = row;
      });
    }

    setModifiers(activeModifiers.map((m) => ({
      id: m.id,
      name: m.name,
      price: String(m.price_delta),
      supplyId: supplyByModifier[m.id]?.supply_id ?? null,
      supplyQty: supplyByModifier[m.id] ? String(supplyByModifier[m.id].quantity_used) : '',
    })));
    setImageUri(p.image_url); setImageBase64(null);
    setRecipeLines([]); // RecipeEditor carga la receta existente solo, vía productId
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

      // Receta capturada antes de que el producto existiera: persistirla
      // ahora que ya tenemos su id (en edición, RecipeEditor ya la guarda
      // línea por línea directamente).
      if (recipeLines.length > 0) {
        await supabase.from('product_supplies').insert(
          recipeLines.map((l) => ({ product_id: productId, ...l })),
        );
      }
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
        let modifierId = m.id ?? null;
        if (modifierId) {
          await supabase.from('modifiers').update(row).eq('id', modifierId);
        } else {
          const { data: createdMod } = await supabase
            .from('modifiers').insert(row).select('id').single();
          modifierId = createdMod?.id ?? null;
        }

        // Insumo adicional del modificador (opcional)
        if (modifierId) {
          const qty = parseFloat(m.supplyQty);
          if (m.supplyId && qty > 0) {
            await supabase.from('modifier_supplies').upsert({
              modifier_id: modifierId, supply_id: m.supplyId, quantity_used: qty,
            });
          } else {
            await supabase.from('modifier_supplies')
              .delete().eq('modifier_id', modifierId);
          }
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

  const visibleProducts = useMemo(() => {
    let rows = products;
    if (filterCategoryId) {
      rows = rows.filter((p) => p.category_id === filterCategoryId);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter((p) =>
        p.name.toLowerCase().includes(q)
        || (p.description ?? '').toLowerCase().includes(q));
    }
    rows = [...rows];
    if (sortKey === 'name') {
      rows.sort((a, b) => a.name.localeCompare(b.name, 'es'));
    } else if (sortKey === 'price_asc') {
      rows.sort((a, b) => Number(a.base_price) - Number(b.base_price));
    } else {
      rows.sort((a, b) => Number(b.base_price) - Number(a.base_price));
    }
    return rows;
  }, [products, search, filterCategoryId, sortKey]);

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <View style={styles.screenHeader}>
        <Pressable onPress={() => router.push('/(app)/admin')} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color="#4A1B0C" />
        </Pressable>
        <Text style={styles.screenHeaderTitle}>Menú</Text>
        <View style={{ width: 22 }} />
      </View>
      <FlatList
        data={visibleProducts}
        keyExtractor={(p) => p.id}
        contentContainerStyle={[
          { padding: 16, gap: 10, paddingBottom: 96 },
          isWide && { maxWidth: 640, width: '100%', alignSelf: 'center' },
        ]}
        ListHeaderComponent={
          <View style={{ gap: 10, marginBottom: 4 }}>
            <View style={styles.searchBox}>
              <Ionicons name="search-outline" size={16} color="#999" />
              <TextInput
                placeholderTextColor="#9A9A9A"
                style={styles.searchInput}
                placeholder="Buscar producto…"
                value={search}
                onChangeText={setSearch}
              />
              {search.length > 0 && (
                <Pressable hitSlop={8} onPress={() => setSearch('')}>
                  <Ionicons name="close-circle" size={16} color="#ccc" />
                </Pressable>
              )}
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8 }}>
              <Pressable
                style={[styles.filterChip, !filterCategoryId && styles.filterChipOn]}
                onPress={() => setFilterCategoryId(null)}>
                <Text style={[styles.filterChipText, !filterCategoryId && styles.filterChipTextOn]}>
                  Todas
                </Text>
              </Pressable>
              {categories.map((c) => (
                <Pressable key={c.id}
                  style={[styles.filterChip, filterCategoryId === c.id && styles.filterChipOn]}
                  onPress={() => setFilterCategoryId(c.id)}>
                  <Text style={[styles.filterChipText, filterCategoryId === c.id && styles.filterChipTextOn]}>
                    {c.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={styles.sortLabel}>Ordenar:</Text>
              {([
                ['name', 'Nombre'],
                ['price_asc', 'Precio ↑'],
                ['price_desc', 'Precio ↓'],
              ] as [SortKey, string][]).map(([key, label]) => (
                <Pressable key={key}
                  style={[styles.sortChip, sortKey === key && styles.sortChipOn]}
                  onPress={() => setSortKey(key)}>
                  <Text style={[styles.sortChipText, sortKey === key && styles.sortChipTextOn]}>
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {(search || filterCategoryId) && (
              <Text style={styles.resultCount}>
                {visibleProducts.length} producto{visibleProducts.length === 1 ? '' : 's'}
              </Text>
            )}
          </View>
        }
        ListEmptyComponent={
          <Text style={styles.empty}>
            {search || filterCategoryId
              ? 'No hay productos que coincidan con tu búsqueda.'
              : 'Aún no tienes productos. Agrega el primero con el botón +.'}
          </Text>
        }
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
                  : tier === 'free' ? (HIDE_PRO_UI ? 'Fotos no disponibles' : 'Fotos de productos (Pro)') : 'Agregar foto (opcional)'}
              </Text>
            </Pressable>
            <TextInput placeholderTextColor="#9A9A9A" style={styles.input} placeholder="Nombre"
              value={name} onChangeText={setName} />
            <TextInput placeholderTextColor="#9A9A9A" style={styles.input} placeholder="Precio base"
              keyboardType="decimal-pad" value={price} onChangeText={setPrice} />
            <TextInput placeholderTextColor="#9A9A9A" style={styles.input} placeholder="Descripción (opcional)"
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
            <TextInput placeholderTextColor="#9A9A9A" style={styles.input} placeholder="…o escribe una categoría nueva"
              value={newCategory} onChangeText={setNewCategory} />

            <Text style={styles.label}>Modificadores</Text>
            {modifiers.map((m, i) => (
              <View key={m.id ?? `new-${i}`} style={{ gap: 4 }}>
                <View style={styles.modRow}>
                  <TextInput placeholderTextColor="#9A9A9A"
                    style={[styles.input, { flex: 1 }]}
                    placeholder="Nombre (ej. Tamaño grande)"
                    value={m.name}
                    onChangeText={(v) => setModifiers((ms) =>
                      ms.map((x, j) => (j === i ? { ...x, name: v } : x)))}
                  />
                  <TextInput placeholderTextColor="#9A9A9A"
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

                {m.supplyId ? (
                  <View style={styles.modSupplyRow}>
                    <Ionicons name="cube-outline" size={13} color="#4A1B0C" />
                    <Text style={styles.modSupplyName} numberOfLines={1}>
                      {supplies.find((s) => s.id === m.supplyId)?.name ?? '—'}
                    </Text>
                    <TextInput placeholderTextColor="#9A9A9A"
                      style={styles.modSupplyQty}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      value={m.supplyQty}
                      onChangeText={(v) => setModifiers((ms) =>
                        ms.map((x, j) => (j === i
                          ? { ...x, supplyQty: v.replace(/[^0-9.]/g, '') } : x)))}
                    />
                    <Text style={styles.modSupplyUnit}>
                      {supplies.find((s) => s.id === m.supplyId)?.unit ?? ''}
                    </Text>
                    <Pressable hitSlop={8}
                      onPress={() => setModifiers((ms) =>
                        ms.map((x, j) => (j === i ? { ...x, supplyId: null, supplyQty: '' } : x)))}>
                      <Ionicons name="close-circle" size={16} color="#ccc" />
                    </Pressable>
                  </View>
                ) : (
                  <Pressable style={styles.addModSupply} onPress={() => setPickerForIndex(i)}>
                    <Ionicons name="add-circle-outline" size={13} color="#888" />
                    <Text style={styles.addModSupplyText}>Insumo adicional (opcional)</Text>
                  </Pressable>
                )}
              </View>
            ))}

            <Modal visible={pickerForIndex !== null} transparent animationType="slide"
              onRequestClose={() => setPickerForIndex(null)}>
              <Pressable style={styles.backdrop} onPress={() => setPickerForIndex(null)} />
              <View style={[styles.sheet, { maxHeight: '70%' }]}>
                <Text style={styles.sheetTitle}>Elige un insumo</Text>
                <ScrollView contentContainerStyle={{ gap: 6 }}>
                  {supplies.length === 0 ? (
                    <Text style={{ color: '#999', fontSize: 12, fontStyle: 'italic' }}>
                      No tienes insumos creados aún. Créalos primero en la pestaña Insumos.
                    </Text>
                  ) : (
                    supplies.map((s) => (
                      <Pressable key={s.id} style={styles.pickerRow}
                        onPress={() => {
                          if (pickerForIndex !== null) {
                            setModifiers((ms) => ms.map((x, j) =>
                              j === pickerForIndex ? { ...x, supplyId: s.id, supplyQty: '' } : x));
                          }
                          setPickerForIndex(null);
                        }}>
                        <Text style={styles.pickerName}>{s.name}</Text>
                        <Text style={styles.pickerUnit}>{s.unit}</Text>
                      </Pressable>
                    ))
                  )}
                </ScrollView>
              </View>
            </Modal>
            <Pressable
              style={styles.addModifier}
              onPress={() => setModifiers((ms) => [...ms, { name: '', price: '', supplyId: null, supplyQty: '' }])}>
              <Ionicons name="add" size={16} color="#4A1B0C" />
              <Text style={styles.addModifierText}>Agregar modificador</Text>
            </Pressable>

            <RecipeEditor
              productId={editing?.id ?? null}
              basePrice={parseFloat(price) || 0}
              onChange={setRecipeLines}
            />

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
  screenHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 54, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  screenHeaderTitle: { fontSize: 16, fontWeight: '700', color: '#222' },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 9,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#1F1F1F' },
  filterChip: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 18,
    paddingVertical: 6, paddingHorizontal: 14,
  },
  filterChipOn: { borderColor: '#4A1B0C', backgroundColor: '#FAECE7' },
  filterChipText: { fontSize: 12.5, color: '#444' },
  filterChipTextOn: { color: '#4A1B0C', fontWeight: '600' },
  sortLabel: { fontSize: 12, color: '#888' },
  sortChip: {
    borderWidth: 1, borderColor: '#eee', borderRadius: 14,
    paddingVertical: 4, paddingHorizontal: 10,
  },
  sortChipOn: { borderColor: '#4A1B0C', backgroundColor: '#4A1B0C' },
  sortChipText: { fontSize: 11.5, color: '#666' },
  sortChipTextOn: { color: '#FAECE7', fontWeight: '600' },
  resultCount: { fontSize: 11.5, color: '#999' },
  empty: { textAlign: 'center', color: '#999', fontSize: 13, marginTop: 30 },
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
    color: '#1F1F1F',
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
  modSupplyRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FAECE7', borderRadius: 8, paddingVertical: 5, paddingHorizontal: 8,
    marginLeft: 2, alignSelf: 'flex-start',
  },
  modSupplyName: { fontSize: 11.5, color: '#4A1B0C', maxWidth: 120 },
  modSupplyQty: {
    width: 44, borderWidth: 1, borderColor: '#E0C8BC', borderRadius: 6,
    paddingVertical: 2, paddingHorizontal: 6, fontSize: 11.5, color: '#1F1F1F',
    backgroundColor: '#fff', textAlign: 'right',
  },
  modSupplyUnit: { fontSize: 10.5, color: '#8A6A5A' },
  addModSupply: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 2,
  },
  addModSupplyText: { fontSize: 11.5, color: '#999' },
  pickerRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: '#f5f5f5',
  },
  pickerName: { fontSize: 14, color: '#333' },
  pickerUnit: { fontSize: 12, color: '#999' },
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

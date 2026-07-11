import { useEffect, useState } from 'react';
import {
  Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Modifier, Product } from '../types/db';

interface Props {
  product: (Product & { modifiers?: Modifier[] }) | null;
  onClose: () => void;
  onAdd: (modifiers: Modifier[], quantity: number, notes?: string) => void;
}

export default function ProductModal({ product, onClose, onAdd }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');

  // Reinicia el estado cada vez que se abre con otro producto
  useEffect(() => {
    setSelected(new Set());
    setQuantity(1);
    setNotes('');
  }, [product?.id]);

  if (!product) return null;

  const modifiers = (product.modifiers ?? []).filter((m) => m.is_active !== false);
  const chosen = modifiers.filter((m) => selected.has(m.id));
  const unitPrice =
    product.base_price + chosen.reduce((a, m) => a + m.price_delta, 0);
  const lineTotal = +(unitPrice * quantity).toFixed(2);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1, justifyContent: 'flex-end' }}
        >
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{product.name}</Text>
            <Text style={styles.basePrice}>Base ${product.base_price.toFixed(2)}</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={24} color="#666" />
          </Pressable>
        </View>

        <ScrollView style={{ maxHeight: 320 }}>
          {modifiers.length > 0 && (
            <Text style={styles.sectionTitle}>Personalizar</Text>
          )}
          {modifiers.map((m) => {
            const isOn = selected.has(m.id);
            return (
              <Pressable
                key={m.id}
                style={[styles.modifierRow, isOn && styles.modifierOn]}
                onPress={() => toggle(m.id)}
              >
                <Ionicons
                  name={isOn ? 'checkbox' : 'square-outline'}
                  size={20}
                  color={isOn ? '#4A1B0C' : '#aaa'}
                />
                <Text style={[styles.modifierName, isOn && { fontWeight: '600' }]}>
                  {m.name}
                </Text>
                <Text style={styles.modifierPrice}>
                  {m.price_delta > 0 ? `+$${m.price_delta.toFixed(2)}` : 'Sin costo'}
                </Text>
              </Pressable>
            );
          })}

          <Text style={styles.sectionTitle}>Nota para el barista</Text>
          <TextInput placeholderTextColor="#9A9A9A"
            style={styles.notesInput}
            placeholder="Ej. sin azúcar, extra caliente"
            value={notes}
            onChangeText={setNotes}
          />
        </ScrollView>

        <View style={styles.footer}>
          <View style={styles.stepper}>
            <Pressable
              hitSlop={8}
              onPress={() => setQuantity((q) => Math.max(1, q - 1))}
            >
              <Ionicons name="remove-circle-outline" size={30} color="#4A1B0C" />
            </Pressable>
            <Text style={styles.quantity}>{quantity}</Text>
            <Pressable hitSlop={8} onPress={() => setQuantity((q) => q + 1)}>
              <Ionicons name="add-circle-outline" size={30} color="#4A1B0C" />
            </Pressable>
          </View>
          <Pressable
            style={styles.addButton}
            onPress={() => onAdd(chosen, quantity, notes.trim() || undefined)}
          >
            <Text style={styles.addText}>Agregar ${lineTotal.toFixed(2)}</Text>
          </Pressable>
        </View>
      </View>
            </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 32, gap: 8,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start' },
  title: { fontSize: 18, fontWeight: '600' },
  basePrice: { fontSize: 13, color: '#666', marginTop: 2 },
  sectionTitle: { fontSize: 12, color: '#888', marginTop: 12, marginBottom: 6 },
  modifierRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 10,
    borderWidth: 1, borderColor: '#eee', borderRadius: 10, marginBottom: 6,
  },
  modifierOn: { borderColor: '#4A1B0C', backgroundColor: '#FAECE7' },
  modifierName: { flex: 1, fontSize: 14 },
  modifierPrice: { fontSize: 13, color: '#666' },
  notesInput: {
    color: '#1F1F1F',
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14,
  },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 12 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  quantity: { fontSize: 18, fontWeight: '600', minWidth: 24, textAlign: 'center' },
  addButton: {
    flex: 1, backgroundColor: '#4A1B0C', borderRadius: 10,
    paddingVertical: 14, alignItems: 'center',
  },
  addText: { color: '#FAECE7', fontSize: 15, fontWeight: '600' },
});

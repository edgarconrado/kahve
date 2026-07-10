import {
  FlatList, KeyboardAvoidingView, Modal, Platform, Pressable,
  StyleSheet, Text, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useCart, cartTotals, lineUnitPrice } from '../store/cart';

interface Props {
  visible: boolean;
  onClose: () => void;
  onCheckout: () => void;
}

export default function TicketSheet({ visible, onClose, onCheckout }: Props) {
  const cart = useCart();
  const { total } = cartTotals(cart.subtotal());

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'flex-end' }}
      >
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Ticket</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={22} color="#666" />
            </Pressable>
          </View>

          <FlatList
            data={cart.lines}
            keyExtractor={(l) => l.lineId}
            style={{ maxHeight: 360 }}
            contentContainerStyle={{ gap: 10, paddingBottom: 8 }}
            ListEmptyComponent={
              <Text style={styles.empty}>El ticket está vacío.</Text>
            }
            renderItem={({ item }) => {
              const unit = lineUnitPrice(item);
              return (
                <View style={styles.line}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.lineName}>{item.product.name}</Text>
                    {item.modifiers.length > 0 && (
                      <Text style={styles.lineMods}>
                        {item.modifiers.map((m) => m.name).join(' · ')}
                      </Text>
                    )}
                    {item.notes ? (
                      <Text style={styles.lineNotes}>Nota: {item.notes}</Text>
                    ) : null}
                    <Text style={styles.lineUnit}>${unit.toFixed(2)} c/u</Text>
                  </View>
                  <View style={styles.lineRight}>
                    <View style={styles.stepper}>
                      <Pressable hitSlop={8} onPress={() =>
                        item.quantity > 1
                          ? cart.setQuantity(item.lineId, item.quantity - 1)
                          : cart.remove(item.lineId)}>
                        <Ionicons
                          name={item.quantity > 1 ? 'remove-circle-outline' : 'trash-outline'}
                          size={24} color="#4A1B0C" />
                      </Pressable>
                      <Text style={styles.qty}>{item.quantity}</Text>
                      <Pressable hitSlop={8}
                        onPress={() => cart.setQuantity(item.lineId, item.quantity + 1)}>
                        <Ionicons name="add-circle-outline" size={24} color="#4A1B0C" />
                      </Pressable>
                    </View>
                    <Text style={styles.lineTotal}>
                      ${(unit * item.quantity).toFixed(2)}
                    </Text>
                  </View>
                </View>
              );
            }}
          />

          <View style={styles.footer}>
            <View>
              <Text style={styles.footerLabel}>Total · IVA incluido</Text>
              <Text style={styles.footerTotal}>${total.toFixed(2)}</Text>
            </View>
            <Pressable
              style={[styles.checkout, cart.lines.length === 0 && { opacity: 0.5 }]}
              disabled={cart.lines.length === 0}
              onPress={onCheckout}
            >
              <Text style={styles.checkoutText}>Cobrar</Text>
              <Ionicons name="arrow-forward" size={16} color="#4A1B0C" />
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
    padding: 20, paddingBottom: 28,
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 12,
  },
  title: { fontSize: 18, fontWeight: '700' },
  empty: { color: '#888', fontSize: 13, textAlign: 'center', paddingVertical: 20 },
  line: {
    flexDirection: 'row', gap: 10,
    borderWidth: 1, borderColor: '#eee', borderRadius: 12, padding: 12,
  },
  lineName: { fontSize: 14, fontWeight: '600', color: '#222' },
  lineMods: { fontSize: 12, color: '#666', marginTop: 1 },
  lineNotes: { fontSize: 12, color: '#993C1D', fontStyle: 'italic', marginTop: 1 },
  lineUnit: { fontSize: 11, color: '#999', marginTop: 3 },
  lineRight: { alignItems: 'flex-end', justifyContent: 'space-between' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qty: { fontSize: 15, fontWeight: '700', minWidth: 20, textAlign: 'center' },
  lineTotal: { fontSize: 14, fontWeight: '700', color: '#222', marginTop: 6 },
  footer: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderTopWidth: 1, borderTopColor: '#f0f0f0', paddingTop: 14, marginTop: 6,
  },
  footerLabel: { fontSize: 11, color: '#888' },
  footerTotal: { fontSize: 22, fontWeight: '700', color: '#222' },
  checkout: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#F0997B', borderRadius: 24,
    paddingVertical: 12, paddingHorizontal: 24,
  },
  checkoutText: { color: '#4A1B0C', fontWeight: '700', fontSize: 15 },
});

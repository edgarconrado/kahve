import { useState } from 'react';
import { Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useVersionCheck } from '../lib/version';

export default function UpdateBanner() {
  const { updateAvailable, updateRequired, info } = useVersionCheck();
  const [dismissed, setDismissed] = useState(false);

  if (!info) return null;

  // Actualización obligatoria: bloquea el uso por completo, sin forma de
  // cerrar — se usa solo para arreglos críticos (ej. un bug que corrompe
  // datos), activándolo con min_required_version en la tabla app_versions.
  if (updateRequired) {
    return (
      <Modal visible transparent={false} animationType="fade">
        <View style={styles.blockingContainer}>
          <Ionicons name="arrow-up-circle" size={56} color="#F0997B" />
          <Text style={styles.blockingTitle}>Actualización requerida</Text>
          <Text style={styles.blockingText}>
            {info.message
              || 'Esta versión de Kahve ya no es compatible. Actualiza para seguir usando la app.'}
          </Text>
          <Pressable
            style={styles.blockingButton}
            onPress={() => Linking.openURL(info.updateUrl)}
          >
            <Text style={styles.blockingButtonText}>Actualizar ahora</Text>
          </Pressable>
        </View>
      </Modal>
    );
  }

  // Actualización opcional: aviso discreto, descartable por esta sesión.
  if (!updateAvailable || dismissed) return null;

  return (
    <View style={styles.banner}>
      <Ionicons name="arrow-up-circle-outline" size={16} color="#4A1B0C" />
      <Text style={styles.text}>Hay una nueva versión de Kahve disponible</Text>
      <Pressable onPress={() => Linking.openURL(info.updateUrl)} hitSlop={6}>
        <Text style={styles.link}>Actualizar</Text>
      </Pressable>
      <Pressable onPress={() => setDismissed(true)} hitSlop={8}>
        <Ionicons name="close" size={16} color="#B0A296" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FAECE7', paddingTop: 50, paddingBottom: 10,
    paddingHorizontal: 16,
  },
  text: { flex: 1, color: '#4A1B0C', fontSize: 12, fontWeight: '600' },
  link: { color: '#4A1B0C', fontSize: 12, fontWeight: '800', textDecorationLine: 'underline' },
  blockingContainer: {
    flex: 1, backgroundColor: '#4A1B0C',
    alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14,
  },
  blockingTitle: { color: '#FAECE7', fontSize: 22, fontWeight: '800' },
  blockingText: { color: '#F5C4B3', fontSize: 14, textAlign: 'center', lineHeight: 21 },
  blockingButton: {
    backgroundColor: '#F0997B', borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 32, marginTop: 8,
  },
  blockingButtonText: { color: '#4A1B0C', fontWeight: '800', fontSize: 15 },
});

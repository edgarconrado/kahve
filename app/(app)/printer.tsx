import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import {
  Alert, FlatList, PermissionsAndroid, Platform, Pressable, StyleSheet, Text, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  getPairedPrinters, getSelectedPrinter, selectPrinter, forgetPrinter,
  type PairedPrinter,
} from '../../lib/printer';

export default function PrinterSettings() {
  const [devices, setDevices] = useState<PairedPrinter[]>([]);
  const [current, setCurrent] = useState<
    { name: string; macAddress: string; widthMM: '58' | '80' } | null
  >(null);
  const [scanning, setScanning] = useState(false);
  const [widthMM, setWidthMM] = useState<'58' | '80'>('58');

  useFocusEffect(
    useCallback(() => {
      getSelectedPrinter().then((p) => {
        setCurrent(p);
        if (p) setWidthMM(p.widthMM);
      });
    }, []),
  );

  // Android 12+ (API 31+) exige pedir estos permisos EN TIEMPO DE EJECUCIÓN,
  // no basta con declararlos en app.json — sin esto, la llamada nativa se
  // puede quedar esperando en silencio, sin mostrar el diálogo del sistema
  // ni arrojar un error.
  const ensureBluetoothPermissions = async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return true;
    if (Platform.Version < 31) {
      // Versiones anteriores usan permiso de ubicación para escanear BT
      const res = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      );
      return res === PermissionsAndroid.RESULTS.GRANTED;
    }
    const res = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
    ]);
    return (
      res[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED
      && res[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED
    );
  };

  // Si la llamada nativa se cuelga (p. ej. por permisos), esto evita que la
  // pantalla se quede en "Buscando…" para siempre sin explicar por qué.
  const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> =>
    Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('La búsqueda tardó demasiado. Intenta de nuevo.')), ms)),
    ]);

  const scan = async () => {
    setScanning(true);
    try {
      const granted = await ensureBluetoothPermissions();
      if (!granted) {
        Alert.alert(
          'Falta permiso de Bluetooth',
          'Kahve necesita permiso de Bluetooth para buscar impresoras. Actívalo ' +
          'en Ajustes del sistema → Apps → Kahve → Permisos.',
        );
        setScanning(false);
        return;
      }
      const list = await withTimeout(getPairedPrinters(), 8000);
      setDevices(list);
      if (list.length === 0) {
        Alert.alert(
          'Sin impresoras emparejadas',
          'Empareja tu impresora primero desde los Ajustes de Bluetooth de tu ' +
          'dispositivo (fuera de Kahve), y luego regresa a esta pantalla.',
        );
      }
    } catch (e: any) {
      Alert.alert('No se pudo buscar', e?.message ?? 'Revisa que el Bluetooth esté activado.');
    }
    setScanning(false);
  };

  const choose = async (d: PairedPrinter) => {
    try {
      await selectPrinter(d, widthMM);
      setCurrent({ ...d, widthMM });
      Alert.alert(
        'Impresora conectada',
        `${d.name || d.macAddress} quedó lista para imprimir tickets.`,
      );
    } catch (e: any) {
      Alert.alert('No se pudo conectar', e?.message ?? 'Intenta de nuevo.');
    }
  };

  const remove = () => {
    Alert.alert('Olvidar impresora', '¿Seguro que quieres desconectarla?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Olvidar', style: 'destructive',
        onPress: async () => { await forgetPrinter(); setCurrent(null); },
      },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color="#4A1B0C" />
        </Pressable>
        <Text style={styles.headerTitle}>Impresora</Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={{ padding: 20, gap: 16 }}>
        {current ? (
          <View style={styles.currentCard}>
            <Ionicons name="print" size={22} color="#0F6E56" />
            <View style={{ flex: 1 }}>
              <Text style={styles.currentName}>{current.name}</Text>
              <Text style={styles.currentMeta}>
                Conectada · papel {current.widthMM}mm
              </Text>
            </View>
            <Pressable onPress={remove} hitSlop={8}>
              <Ionicons name="close-circle" size={20} color="#ccc" />
            </Pressable>
          </View>
        ) : (
          <Text style={styles.hint}>
            No tienes una impresora configurada en este dispositivo. Empareja tu
            impresora térmica desde los Ajustes de Bluetooth del sistema, y luego
            búscala aquí.
          </Text>
        )}

        <Text style={styles.label}>Ancho de papel</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(['58', '80'] as const).map((w) => (
            <Pressable key={w}
              style={[styles.widthChip, widthMM === w && styles.widthChipOn]}
              onPress={() => setWidthMM(w)}>
              <Text style={[styles.widthChipText, widthMM === w && styles.widthChipTextOn]}>
                {w} mm
              </Text>
            </Pressable>
          ))}
        </View>

        <Pressable style={styles.scanButton} onPress={scan} disabled={scanning}>
          <Ionicons name="bluetooth-outline" size={17} color="#FAECE7" />
          <Text style={styles.scanButtonText}>
            {scanning ? 'Buscando…' : 'Buscar impresoras emparejadas'}
          </Text>
        </Pressable>

        <FlatList
          data={devices}
          keyExtractor={(d) => d.macAddress}
          contentContainerStyle={{ gap: 8 }}
          renderItem={({ item }) => (
            <Pressable style={styles.deviceRow} onPress={() => choose(item)}>
              <Ionicons name="bluetooth" size={16} color="#4A1B0C" />
              <View style={{ flex: 1 }}>
                <Text style={styles.deviceName}>
                  {item.name || 'Impresora Bluetooth'}
                </Text>
                <Text style={styles.deviceMac}>{item.macAddress}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#bbb" />
            </Pressable>
          )}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 54, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#222' },
  hint: { fontSize: 13, color: '#888', lineHeight: 19 },
  currentCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#E1F5EE', borderRadius: 12, padding: 14,
  },
  currentName: { fontSize: 14, fontWeight: '700', color: '#222' },
  currentMeta: { fontSize: 12, color: '#666', marginTop: 1 },
  label: { fontSize: 12, color: '#888' },
  widthChip: {
    flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
    paddingVertical: 10, alignItems: 'center',
  },
  widthChipOn: { borderColor: '#4A1B0C', backgroundColor: '#FAECE7' },
  widthChipText: { fontSize: 13, color: '#444' },
  widthChipTextOn: { color: '#4A1B0C', fontWeight: '700' },
  scanButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#4A1B0C', borderRadius: 10, paddingVertical: 13,
  },
  scanButtonText: { color: '#FAECE7', fontWeight: '600', fontSize: 14 },
  deviceRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: '#eee', borderRadius: 10, padding: 12,
  },
  deviceName: { flex: 1, fontSize: 13.5, color: '#333' },
  deviceMac: { fontSize: 10.5, color: '#aaa' },
});

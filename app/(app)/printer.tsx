import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import {
  Alert, PermissionsAndroid, Platform, Pressable, ScrollView, StyleSheet,
  Switch, Text, TextInput, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  getPairedPrinters, getReceiptPreferences, getSelectedPrinter, saveReceiptPreferences,
  selectPrinter, forgetPrinter,
  type ReceiptPreferences,
  type PairedPrinter,
} from '../../lib/printer';
import HeaderLogo from '../../components/HeaderLogo';

const DEFAULT_RECEIPT_PREFERENCES: ReceiptPreferences = {
  includeLogo: true,
  includeOrderInfo: true,
  includeCustomer: true,
  includeModifiers: true,
  includePaymentDetails: true,
  footer: 'Gracias por tu visita!',
};

export default function PrinterSettings() {
  const [devices, setDevices] = useState<PairedPrinter[]>([]);
  const [current, setCurrent] = useState<
    { name: string; macAddress: string; widthMM: '58' | '80' } | null
  >(null);
  const [scanning, setScanning] = useState(false);
  const [widthMM, setWidthMM] = useState<'58' | '80'>('58');
  const [receiptPreferences, setReceiptPreferences] = useState(DEFAULT_RECEIPT_PREFERENCES);

  useFocusEffect(
    useCallback(() => {
      getSelectedPrinter().then((p) => {
        setCurrent(p);
        if (p) setWidthMM(p.widthMM);
      });
      getReceiptPreferences().then(setReceiptPreferences);
    }, []),
  );

  const updateReceiptPreference = <K extends keyof ReceiptPreferences>(
    key: K,
    value: ReceiptPreferences[K],
  ) => {
    setReceiptPreferences((current) => {
      const next = { ...current, [key]: value };
      saveReceiptPreferences(next);
      return next;
    });
  };

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
    if (Platform.OS !== 'android') {
      Alert.alert(
        'Impresión en iPad',
        'La búsqueda Bluetooth actual funciona en Android. Para imprimir desde iPad, ' +
        'usa una impresora compatible con AirPrint o configura una integración iOS específica.',
      );
      return;
    }
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
        <Pressable style={{ width: 30 }} onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color="#F5C4B3" />
        </Pressable>
        <Text style={styles.headerTitle}>Impresora</Text>
        <HeaderLogo />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
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
              onPress={() => {
                setWidthMM(w);
                if (current) selectPrinter(current, w);
              }}>
              <Text style={[styles.widthChipText, widthMM === w && styles.widthChipTextOn]}>
                {w} mm
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Contenido del ticket</Text>
        <View style={styles.preferencesBox}>
          {([
            ['includeLogo', 'Logo de la cafetería'],
            ['includeOrderInfo', 'Número y fecha de la orden'],
            ['includeCustomer', 'Nombre del cliente'],
            ['includeModifiers', 'Modificadores de productos'],
            ['includePaymentDetails', 'Descuentos, IVA y detalles del pago'],
          ] as const).map(([key, label]) => (
            <View key={key} style={styles.preferenceRow}>
              <Text style={styles.preferenceLabel}>{label}</Text>
              <Switch
                value={receiptPreferences[key] as boolean}
                onValueChange={(value) => updateReceiptPreference(key, value)}
                trackColor={{ false: '#ddd', true: '#D88A6A' }}
                thumbColor={receiptPreferences[key] ? '#4A1B0C' : '#f4f4f4'}
              />
            </View>
          ))}
          <Text style={styles.label}>Texto al final del ticket</Text>
          <TextInput
            style={styles.footerInput}
            placeholder="Ej. Gracias por tu visita!"
            placeholderTextColor="#9A9A9A"
            value={receiptPreferences.footer}
            onChangeText={(footer) => setReceiptPreferences((current) => ({ ...current, footer }))}
            onEndEditing={() => saveReceiptPreferences(receiptPreferences)}
            maxLength={80}
          />
          <Text style={styles.preferenceHint}>Déjalo vacío si no quieres imprimir un pie.</Text>
        </View>

        <Pressable
          style={[styles.scanButton, Platform.OS !== 'android' && styles.scanButtonDisabled]}
          onPress={scan}
          disabled={scanning}
        >
          <Ionicons name="bluetooth-outline" size={17} color="#FAECE7" />
          <Text style={styles.scanButtonText}>
            {scanning ? 'Buscando…' : Platform.OS === 'android'
              ? 'Buscar impresoras emparejadas'
              : 'Bluetooth no disponible en iPad'}
          </Text>
        </Pressable>

        <View style={{ gap: 8 }}>
          {devices.map((device) => (
            <Pressable
              key={device.macAddress}
              style={styles.deviceRow}
              onPress={() => choose(device)}
            >
              <Ionicons name="bluetooth" size={16} color="#4A1B0C" />
              <View style={{ flex: 1 }}>
                <Text style={styles.deviceName}>
                  {device.name || 'Impresora Bluetooth'}
                </Text>
                <Text style={styles.deviceMac}>{device.macAddress}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#bbb" />
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 54, paddingBottom: 14,
    backgroundColor: '#4A1B0C', borderBottomWidth: 1, borderBottomColor: '#6B2A17',
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#FAECE7' },
  content: { padding: 20, gap: 16, paddingBottom: 36 },
  hint: { fontSize: 13, color: '#888', lineHeight: 19 },
  currentCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#E1F5EE', borderRadius: 12, padding: 14,
  },
  currentName: { fontSize: 14, fontWeight: '700', color: '#222' },
  currentMeta: { fontSize: 12, color: '#666', marginTop: 1 },
  label: { fontSize: 12, color: '#888' },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#333' },
  preferencesBox: {
    borderWidth: 1, borderColor: '#eee', borderRadius: 12, padding: 12, gap: 4,
  },
  preferenceRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    minHeight: 44,
  },
  preferenceLabel: { flex: 1, fontSize: 13, color: '#333', paddingRight: 12 },
  footerInput: {
    color: '#1F1F1F', borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginTop: 8,
  },
  preferenceHint: { fontSize: 11, color: '#999' },
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
  scanButtonDisabled: { opacity: 0.6 },
  scanButtonText: { color: '#FAECE7', fontWeight: '600', fontSize: 14 },
  deviceRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: '#eee', borderRadius: 10, padding: 12,
  },
  deviceName: { flex: 1, fontSize: 13.5, color: '#333' },
  deviceMac: { fontSize: 10.5, color: '#aaa' },
});

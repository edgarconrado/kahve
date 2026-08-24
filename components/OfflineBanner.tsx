import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';

// Aviso persistente cuando no hay conexión. IMPORTANTE: esto NO hace que
// Kahve funcione sin internet — la app sigue necesitando conexión para
// vender, cobrar y todo lo demás. Solo avisa de inmediato al empleado
// para que entienda por qué algo no se está guardando, en vez de recibir
// un error confuso a medio cobro.
export default function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      // isInternetReachable puede ser null mientras se determina; solo
      // marcamos "sin conexión" cuando estamos seguros (false explícito),
      // para no mostrar el aviso de golpe con cada cambio de red.
      const offline = state.isConnected === false || state.isInternetReachable === false;
      setIsOffline(offline);
    });
    return () => unsubscribe();
  }, []);

  if (!isOffline) return null;

  return (
    <View style={styles.banner} pointerEvents="none">
      <Ionicons name="cloud-offline-outline" size={14} color="#FAECE7" />
      <Text style={styles.text}>Sin conexión · los cambios no se guardarán</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 999,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#A32D2D',
    paddingTop: 50, // debajo de la barra de estado del sistema
    paddingBottom: 8,
  },
  text: { color: '#FAECE7', fontSize: 12, fontWeight: '600' },
});

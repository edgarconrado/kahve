import CrashGuard from '../components/CrashGuard'; // primero: instala el handler
import { Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { AuthProvider } from '../lib/auth';
import { configError } from '../lib/supabase';

export default function RootLayout() {
  if (configError) {
    return (
      <View style={cfg.container}>
        <Text style={cfg.title}>☕ Kahve</Text>
        <Text style={cfg.text}>
          Faltan las variables de Supabase en esta compilación.{'\n\n'}
          Revisa que eas.json tenga EXPO_PUBLIC_SUPABASE_URL y
          EXPO_PUBLIC_SUPABASE_ANON_KEY con valores reales en el perfil
          usado para el build, y vuelve a compilar.
        </Text>
      </View>
    );
  }

  return (
    <CrashGuard>
      <AuthProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="login" />
          <Stack.Screen name="register" />
          <Stack.Screen name="(app)" />
        </Stack>
      </AuthProvider>
    </CrashGuard>
  );
}

const cfg = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: '#4A1B0C',
    alignItems: 'center', justifyContent: 'center', padding: 32,
  },
  title: { color: '#FAECE7', fontSize: 26, fontWeight: '800', marginBottom: 14 },
  text: { color: '#F5C4B3', fontSize: 14, lineHeight: 21, textAlign: 'center' },
});

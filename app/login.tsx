import { useState } from 'react';
import { router } from 'expo-router';
import {
  Image, KeyboardAvoidingView, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../lib/auth';

export default function Login() {
  const { signInWithPin } = useAuth();
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSignIn = async () => {
    setBusy(true);
    setError(null);
    const { error } = await signInWithPin(email.trim(), pin);
    setBusy(false);
    if (error) {
      // "error" YA es un string (signInWithPin lo devuelve así desde
      // auth.tsx) — antes se leía error.message sobre ese string, que
      // siempre da undefined, así que esta comparación nunca coincidía
      // y CUALQUIER fallo de login (incluida una simple contraseña mal
      // escrita) mostraba "Error de conexión" en vez del mensaje
      // correcto. Esto fue justo lo que vio el revisor de Apple.
      if (error.includes('Invalid login credentials')) {
        setError('Correo o PIN incorrectos. Intenta de nuevo.');
      } else {
        setError(`Error de conexión: ${error}`);
      }
      return;
    }
    router.replace('/');
  };

  return (
    <View style={styles.root}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {/* Panel superior de marca */}
          <View style={styles.hero}>
            <View style={styles.logoRing}>
              <Image source={require('../assets/icon.png')} style={styles.logo} />
            </View>
            <Text style={styles.title}>Kahve</Text>
            <Text style={styles.tagline}>Punto de venta para cafeterías</Text>
          </View>

          {/* Tarjeta del formulario */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Bienvenido de vuelta</Text>
            <Text style={styles.cardSubtitle}>Inicia sesión para abrir tu turno</Text>

            <View style={styles.inputWrap}>
              <Ionicons name="mail-outline" size={18} color="#B27358" style={styles.inputIcon} />
              <TextInput
                placeholderTextColor="#B0A296"
                style={styles.input}
                placeholder="Correo"
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
              />
            </View>

            <View style={styles.inputWrap}>
              <Ionicons name="lock-closed-outline" size={18} color="#B27358" style={styles.inputIcon} />
              <TextInput
                placeholderTextColor="#B0A296"
                style={styles.input}
                placeholder="PIN"
                secureTextEntry
                keyboardType="number-pad"
                maxLength={6}
                value={pin}
                onChangeText={setPin}
              />
            </View>

            {error && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle-outline" size={15} color="#A32D2D" />
                <Text style={styles.error}>{error}</Text>
              </View>
            )}

            <Pressable
              style={[styles.button, (busy || !email || pin.length < 4) && { opacity: 0.5 }]}
              disabled={busy || !email || pin.length < 4}
              onPress={handleSignIn}
            >
              <Text style={styles.buttonText}>{busy ? 'Entrando…' : 'Entrar'}</Text>
              {!busy && <Ionicons name="arrow-forward" size={17} color="#FAECE7" />}
            </Pressable>

            <Pressable onPress={() => router.push('/register')} hitSlop={10} style={{ marginTop: 18 }}>
              <Text style={styles.registerLink}>
                ¿Nuevo en Kahve? <Text style={{ fontWeight: '700' }}>Registra tu cafetería</Text>
              </Text>
            </Pressable>
          </View>

          <Text style={styles.version}>Kahve · v1.0.9</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#4A1B0C' },
  scroll: { flexGrow: 1 },
  hero: {
    alignItems: 'center', justifyContent: 'center',
    paddingTop: 76, paddingBottom: 40,
  },
  logoRing: {
    width: 92, height: 92, borderRadius: 26,
    backgroundColor: 'rgba(250,236,231,0.12)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  logo: { width: 68, height: 68, borderRadius: 18 },
  title: {
    fontSize: 34, fontWeight: '800', color: '#FAECE7', letterSpacing: 0.5,
  },
  tagline: { fontSize: 13, color: '#F0997B', marginTop: 4 },
  card: {
    backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 24, paddingTop: 32, paddingBottom: 24, flex: 1,
  },
  cardTitle: { fontSize: 19, fontWeight: '700', color: '#222' },
  cardSubtitle: { fontSize: 13, color: '#888', marginTop: 3, marginBottom: 24 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1.3, borderColor: '#EFE4DD', borderRadius: 12,
    paddingHorizontal: 14, marginBottom: 12, backgroundColor: '#FDFAF8',
  },
  inputIcon: { marginTop: 1 },
  input: {
    flex: 1, color: '#1F1F1F', paddingVertical: 13, fontSize: 15,
  },
  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FCEBEB', borderRadius: 10,
    paddingVertical: 9, paddingHorizontal: 12, marginBottom: 4, marginTop: 2,
  },
  error: { color: '#A32D2D', fontSize: 12.5, flex: 1 },
  button: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#4A1B0C', borderRadius: 12,
    paddingVertical: 15, marginTop: 10,
  },
  buttonText: { color: '#FAECE7', fontSize: 15.5, fontWeight: '700' },
  registerLink: { textAlign: 'center', color: '#7A6a60', fontSize: 13 },
  version: {
    textAlign: 'center', fontSize: 11, color: 'rgba(250,236,231,0.35)',
    marginTop: 10, marginBottom: 6,
  },
});

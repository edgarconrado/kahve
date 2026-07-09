import { useState } from 'react';
import { router } from 'expo-router';
import {
  KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
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
      setError('Correo o PIN incorrectos. Intenta de nuevo.');
      return;
    }
    router.replace('/');
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={styles.title}>Kahve</Text>
      <Text style={styles.subtitle}>Inicia sesión para abrir tu turno</Text>

      <TextInput
        style={styles.input}
        placeholder="Correo"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="PIN"
        secureTextEntry
        keyboardType="number-pad"
        maxLength={6}
        value={pin}
        onChangeText={setPin}
      />

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable
        style={[styles.button, busy && { opacity: 0.6 }]}
        disabled={busy || !email || pin.length < 4}
        onPress={handleSignIn}
      >
        <Text style={styles.buttonText}>{busy ? 'Entrando…' : 'Entrar'}</Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 34, fontWeight: '600', textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 12 },
  input: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 16,
  },
  error: { color: '#A32D2D', textAlign: 'center' },
  button: {
    backgroundColor: '#4A1B0C', borderRadius: 10,
    paddingVertical: 14, alignItems: 'center', marginTop: 4,
  },
  buttonText: { color: '#FAECE7', fontSize: 16, fontWeight: '600' },
});

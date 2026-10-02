import { useState } from 'react';
import { router } from 'expo-router';
import {
  Image, KeyboardAvoidingView, Platform, Pressable, StyleSheet,
  Text, TextInput, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

export default function ForgotPin() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendRecovery = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || busy) return;
    setBusy(true);
    setError(null);
    const redirectTo = Platform.OS === 'web'
      ? `${window.location.origin}/reset-pin`
      : 'kahve://reset-pin';
    const { error: recoveryError } = await supabase.auth.resetPasswordForEmail(
      normalizedEmail,
      { redirectTo },
    );
    setBusy(false);
    if (recoveryError) {
      setError(recoveryError.message.includes('rate limit')
        ? 'Espera unos minutos antes de solicitar otro enlace.'
        : 'No pudimos enviar el enlace. Revisa tu conexión e intenta de nuevo.');
      return;
    }
    setSent(true);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.screen}
    >
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color="#F5C4B3" />
        </Pressable>
        <Text style={styles.headerTitle}>Recuperar PIN</Text>
        <Image source={require('../assets/icon.png')} style={styles.logo} />
      </View>

      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <Ionicons name="mail-unread-outline" size={30} color="#4A1B0C" />
        </View>
        <Text style={styles.title}>{sent ? 'Revisa tu correo' : '¿Olvidaste tu PIN?'}</Text>
        <Text style={styles.description}>
          {sent
            ? 'Si existe una cuenta con ese correo, recibirás un enlace para crear un PIN nuevo. Revisa también tu carpeta de spam o correo no deseado.'
            : 'Escribe el correo de tu cuenta y te enviaremos un enlace seguro para cambiarlo.'}
        </Text>

        {!sent && (
          <>
            <View style={styles.inputWrap}>
              <Ionicons name="mail-outline" size={18} color="#B27358" />
              <TextInput
                style={styles.input}
                placeholder="Correo"
                placeholderTextColor="#9A9A9A"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                returnKeyType="send"
                onSubmitEditing={sendRecovery}
              />
            </View>
            {error && <Text style={styles.error}>{error}</Text>}
            <Pressable
              style={[styles.primaryButton, (!email.trim() || busy) && styles.disabled]}
              disabled={!email.trim() || busy}
              onPress={sendRecovery}
            >
              <Text style={styles.primaryText}>{busy ? 'Enviando…' : 'Enviar enlace'}</Text>
            </Pressable>
          </>
        )}

        {sent && (
          <Pressable style={styles.primaryButton} onPress={() => router.replace('/login')}>
            <Text style={styles.primaryText}>Volver al inicio</Text>
          </Pressable>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 54, paddingBottom: 14,
    backgroundColor: '#4A1B0C',
  },
  backButton: { width: 30 },
  headerTitle: { color: '#FAECE7', fontSize: 16, fontWeight: '700' },
  logo: { width: 30, height: 30, borderRadius: 8 },
  content: { padding: 24, maxWidth: 520, width: '100%', alignSelf: 'center' },
  iconCircle: {
    width: 60, height: 60, borderRadius: 16, backgroundColor: '#FAECE7',
    alignItems: 'center', justifyContent: 'center', marginBottom: 18,
  },
  title: { color: '#222', fontSize: 23, fontWeight: '700' },
  description: { color: '#666', fontSize: 14, lineHeight: 21, marginTop: 7, marginBottom: 24 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1.3, borderColor: '#EFE4DD', borderRadius: 12,
    paddingHorizontal: 14, backgroundColor: '#FDFAF8',
  },
  input: { flex: 1, color: '#1F1F1F', paddingVertical: 13, fontSize: 15 },
  error: { color: '#A32D2D', fontSize: 12.5, marginTop: 9 },
  primaryButton: {
    backgroundColor: '#4A1B0C', borderRadius: 12, paddingVertical: 15,
    alignItems: 'center', marginTop: 16,
  },
  primaryText: { color: '#FAECE7', fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.5 },
});

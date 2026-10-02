import { useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import {
  Image, KeyboardAvoidingView, Platform, Pressable, StyleSheet,
  Text, TextInput, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

type RecoveryState = 'loading' | 'ready' | 'invalid' | 'saved';

export default function ResetPin() {
  const url = Linking.useURL();
  const handledUrl = useRef<string | null>(null);
  const [state, setState] = useState<RecoveryState>('loading');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!url || handledUrl.current === url) return;
    handledUrl.current = url;

    const establishRecoverySession = async () => {
      const query = url.includes('?') ? url.split('?')[1].split('#')[0] : '';
      const fragment = url.includes('#') ? url.split('#')[1] : '';
      const params = new URLSearchParams(fragment || query);
      const linkError = params.get('error_description');
      if (linkError) {
        setError(decodeURIComponent(linkError.replace(/\+/g, ' ')));
        setState('invalid');
        return;
      }

      const code = params.get('code');
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      const result = code
        ? await supabase.auth.exchangeCodeForSession(code)
        : accessToken && refreshToken
          ? await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            })
          : { error: new Error('El enlace no contiene una sesión de recuperación.') };

      if (result.error) {
        setError('El enlace expiró o ya fue utilizado. Solicita uno nuevo.');
        setState('invalid');
        return;
      }
      setState('ready');
    };

    establishRecoverySession();
  }, [url]);

  const cleanPin = (value: string) => value.replace(/\D/g, '').slice(0, 6);
  const validPin = /^\d{6}$/.test(pin) && pin === confirmPin;

  const updatePin = async () => {
    if (!validPin || busy) return;
    setBusy(true);
    setError(null);
    const { error: updateError } = await supabase.auth.updateUser({ password: pin });
    if (updateError) {
      setBusy(false);
      setError(updateError.message);
      return;
    }
    await supabase.auth.signOut();
    setBusy(false);
    setState('saved');
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.screen}
    >
      <View style={styles.header}>
        <View style={{ width: 30 }} />
        <Text style={styles.headerTitle}>Nuevo PIN</Text>
        <Image source={require('../assets/icon.png')} style={styles.logo} />
      </View>

      <View style={styles.content}>
        {state === 'loading' && (
          <View style={styles.centerState}>
            <Ionicons name="hourglass-outline" size={32} color="#4A1B0C" />
            <Text style={styles.stateTitle}>Verificando enlace…</Text>
          </View>
        )}

        {state === 'invalid' && (
          <View style={styles.centerState}>
            <Ionicons name="alert-circle-outline" size={38} color="#A32D2D" />
            <Text style={styles.stateTitle}>Enlace no válido</Text>
            <Text style={styles.description}>{error}</Text>
            <Pressable style={styles.primaryButton} onPress={() => router.replace('/forgot-pin')}>
              <Text style={styles.primaryText}>Solicitar otro enlace</Text>
            </Pressable>
          </View>
        )}

        {state === 'ready' && (
          <>
            <View style={styles.iconCircle}>
              <Ionicons name="key-outline" size={30} color="#4A1B0C" />
            </View>
            <Text style={styles.title}>Crea un PIN nuevo</Text>
            <Text style={styles.description}>Usa 6 números que puedas recordar.</Text>

            <TextInput
              style={styles.input}
              placeholder="Nuevo PIN"
              placeholderTextColor="#9A9A9A"
              value={pin}
              onChangeText={(value) => setPin(cleanPin(value))}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={6}
            />
            <TextInput
              style={styles.input}
              placeholder="Confirmar PIN"
              placeholderTextColor="#9A9A9A"
              value={confirmPin}
              onChangeText={(value) => setConfirmPin(cleanPin(value))}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={6}
              returnKeyType="done"
              onSubmitEditing={updatePin}
            />
            {confirmPin.length > 0 && pin !== confirmPin && (
              <Text style={styles.error}>Los PIN no coinciden.</Text>
            )}
            {error && <Text style={styles.error}>{error}</Text>}
            <Pressable
              style={[styles.primaryButton, (!validPin || busy) && styles.disabled]}
              disabled={!validPin || busy}
              onPress={updatePin}
            >
              <Text style={styles.primaryText}>{busy ? 'Guardando…' : 'Guardar nuevo PIN'}</Text>
            </Pressable>
          </>
        )}

        {state === 'saved' && (
          <View style={styles.centerState}>
            <Ionicons name="checkmark-circle-outline" size={42} color="#0F6E56" />
            <Text style={styles.stateTitle}>PIN actualizado</Text>
            <Text style={styles.description}>Ya puedes entrar con tu correo y el PIN nuevo.</Text>
            <Pressable style={styles.primaryButton} onPress={() => router.replace('/login')}>
              <Text style={styles.primaryText}>Iniciar sesión</Text>
            </Pressable>
          </View>
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
  headerTitle: { color: '#FAECE7', fontSize: 16, fontWeight: '700' },
  logo: { width: 30, height: 30, borderRadius: 8 },
  content: { padding: 24, maxWidth: 520, width: '100%', alignSelf: 'center' },
  centerState: { alignItems: 'center', paddingTop: 50 },
  iconCircle: {
    width: 60, height: 60, borderRadius: 16, backgroundColor: '#FAECE7',
    alignItems: 'center', justifyContent: 'center', marginBottom: 18,
  },
  title: { color: '#222', fontSize: 23, fontWeight: '700' },
  stateTitle: { color: '#222', fontSize: 20, fontWeight: '700', marginTop: 12 },
  description: { color: '#666', fontSize: 14, lineHeight: 21, marginTop: 7, marginBottom: 22, textAlign: 'center' },
  input: {
    color: '#1F1F1F', borderWidth: 1.3, borderColor: '#EFE4DD', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 13, fontSize: 16,
    backgroundColor: '#FDFAF8', marginTop: 12,
  },
  error: { color: '#A32D2D', fontSize: 12.5, marginTop: 8 },
  primaryButton: {
    alignSelf: 'stretch', backgroundColor: '#4A1B0C', borderRadius: 12,
    paddingVertical: 15, alignItems: 'center', marginTop: 18,
  },
  primaryText: { color: '#FAECE7', fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.5 },
});

import { useState } from 'react';
import { router } from 'expo-router';
import {
  Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput,
} from 'react-native';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

export default function Register() {
  const { signInWithPin } = useAuth();
  const [orgName, setOrgName] = useState('');
  const [branchName, setBranchName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [busy, setBusy] = useState(false);

  const missing = [
    !orgName.trim() && 'nombre de la cafetería',
    !ownerName.trim() && 'tu nombre',
    !email.trim() && 'correo',
    !/^\d{6}$/.test(pin) && 'PIN de 6 dígitos',
    pin !== pin2 && 'los PIN no coinciden',
  ].filter(Boolean) as string[];
  const canSubmit = missing.length === 0 && !busy;

  const register = async () => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('signup', {
      body: { orgName, branchName, ownerName, email, pin },
    });

    let failure: string | null = data?.error ?? null;
    if (error instanceof FunctionsHttpError) {
      const raw = await error.context.text();
      try {
        const parsed = JSON.parse(raw);
        failure = parsed.error ?? parsed.message ?? raw;
      } catch { failure = raw || error.message; }
    } else if (error) {
      failure = error.message;
    }
    if (failure || !data?.ok) {
      setBusy(false);
      Alert.alert('No se pudo registrar', failure ?? 'Intenta de nuevo.');
      return;
    }

    // Registro exitoso: entrar de inmediato con las credenciales nuevas
    const { error: loginError } = await signInWithPin(email.trim(), pin);
    setBusy(false);
    if (loginError) {
      Alert.alert('Cuenta creada', 'Inicia sesión con tu correo y PIN.');
      router.replace('/login');
      return;
    }
    router.replace('/');
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Registra tu cafetería</Text>
        <Text style={styles.subtitle}>
          Crea tu cuenta de Kahve en un minuto. Tú serás el administrador
          y podrás dar de alta a tu equipo desde la app.
        </Text>

        <Text style={styles.label}>Tu cafetería</Text>
        <TextInput placeholderTextColor="#9A9A9A" style={styles.input} placeholder="Nombre de la cafetería"
          value={orgName} onChangeText={setOrgName} autoCapitalize="words" />
        <TextInput placeholderTextColor="#9A9A9A" style={styles.input}
          placeholder="Nombre de la sucursal (opcional, ej. Centro)"
          value={branchName} onChangeText={setBranchName} autoCapitalize="words" />

        <Text style={styles.label}>Tu cuenta de administrador</Text>
        <TextInput placeholderTextColor="#9A9A9A" style={styles.input} placeholder="Tu nombre"
          value={ownerName} onChangeText={setOwnerName} autoCapitalize="words" />
        <TextInput placeholderTextColor="#9A9A9A" style={styles.input} placeholder="Correo"
          autoCapitalize="none" keyboardType="email-address"
          value={email} onChangeText={setEmail} />
        <TextInput placeholderTextColor="#9A9A9A" style={styles.input} placeholder="PIN (6 dígitos)"
          keyboardType="number-pad" maxLength={6} secureTextEntry
          value={pin} onChangeText={setPin} />
        <TextInput placeholderTextColor="#9A9A9A" style={styles.input} placeholder="Confirma tu PIN"
          keyboardType="number-pad" maxLength={6} secureTextEntry
          value={pin2} onChangeText={setPin2} />

        {missing.length > 0 && (orgName || email || pin) ? (
          <Text style={styles.missing}>Falta: {missing.join(', ')}</Text>
        ) : null}

        <Pressable
          style={[styles.button, !canSubmit && { opacity: 0.5 }]}
          disabled={!canSubmit}
          onPress={register}
        >
          <Text style={styles.buttonText}>
            {busy ? 'Creando tu cafetería…' : 'Crear mi cafetería'}
          </Text>
        </Pressable>

        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Text style={styles.backLink}>Ya tengo cuenta · Iniciar sesión</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 10 },
  title: { fontSize: 26, fontWeight: '700', textAlign: 'center', color: '#4A1B0C' },
  subtitle: {
    fontSize: 13, color: '#666', textAlign: 'center',
    marginBottom: 10, lineHeight: 19,
  },
  label: { fontSize: 12, color: '#888', marginTop: 6 },
  input: {
    color: '#1F1F1F',
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
  },
  missing: { fontSize: 12, color: '#A32D2D' },
  button: {
    backgroundColor: '#4A1B0C', borderRadius: 10,
    paddingVertical: 14, alignItems: 'center', marginTop: 6,
  },
  buttonText: { color: '#FAECE7', fontSize: 15, fontWeight: '600' },
  backLink: {
    textAlign: 'center', color: '#4A1B0C', fontSize: 13,
    fontWeight: '600', marginTop: 10,
  },
});

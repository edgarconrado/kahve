import { useCallback, useEffect, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import {
  Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import {
  usePlan, STRIPE_LINK_MONTHLY, STRIPE_LINK_YEARLY, STORE_BUILD,
  KAHVE_SUBSCRIBE_PAGE, HIDE_PRO_UI,
} from '../../lib/plan';

const BENEFITS = [
  ['people', 'Empleados ilimitados (el gratuito incluye 3)'],
  ['bar-chart', 'Reportes por semana, mes y año'],
  ['share-social', 'Exportar reportes y enviar tickets por WhatsApp'],
  ['tv', 'Tablero de órdenes listas para tus clientes'],
  ['image', 'Fotos en tus productos'],
] as const;

export default function Upgrade() {
  const { employee } = useAuth();
  const { tier, isTrial, daysLeft } = usePlan(employee);
  const [slug, setSlug] = useState<string | null>(null);

  // Defensa adicional: esta pantalla no debería ser alcanzable en iOS
  // (el enlace en Perfil ya está oculto), pero si por algún otro camino
  // se llega aquí, no renderiza nada relacionado a compras — regresa
  // de inmediato. Ver Guideline 3.1.1 de Apple.
  useEffect(() => {
    if (HIDE_PRO_UI) router.back();
  }, []);
  if (HIDE_PRO_UI) return null;

  useFocusEffect(
    useCallback(() => {
      if (!employee) return;
      supabase
        .from('organizations')
        .select('slug')
        .eq('id', employee.organization_id)
        .single()
        .then(({ data }) => setSlug(data?.slug ?? null));
    }, [employee?.organization_id]),
  );

  const subscribe = (baseLink: string) => {
    if (!slug) {
      Alert.alert('Un momento', 'Cargando los datos de tu cafetería…');
      return;
    }
    if (baseLink.includes('PEGA_EL')) {
      Alert.alert(
        'Falta configurar',
        'Los Payment Links de Stripe aún no están pegados en lib/plan.ts.',
      );
      return;
    }
    // El slug identifica a la organización ante el webhook de Stripe
    Linking.openURL(`${baseLink}?client_reference_id=${slug}`);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>☕ Kahve Pro</Text>
        <Text style={styles.heroSub}>
          {tier === 'pro' && !isTrial
            ? 'Tu suscripción está activa. ¡Gracias!'
            : isTrial
              ? `Estás en tu prueba gratuita · ${daysLeft} día${daysLeft === 1 ? '' : 's'} restante${daysLeft === 1 ? '' : 's'}`
              : 'Desbloquea todo el potencial de tu cafetería'}
        </Text>
      </View>

      <View style={styles.benefits}>
        {BENEFITS.map(([icon, label]) => (
          <View key={label} style={styles.benefitRow}>
            <Ionicons name={`${icon}-outline` as any} size={18} color="#4A1B0C" />
            <Text style={styles.benefitText}>{label}</Text>
          </View>
        ))}
      </View>

      {tier === 'pro' && !isTrial && !STORE_BUILD && (
        <Pressable style={styles.manageButton} onPress={async () => {
          const { data, error } = await supabase.functions.invoke('create-portal-session');

          // Diagnóstico: mostrar el motivo real en vez de un mensaje genérico
          let failure: string | null = data?.error ?? null;
          if (error && !failure) {
            const anyErr = error as any;
            if (anyErr?.context?.text) {
              try {
                const raw = await anyErr.context.text();
                try { failure = JSON.parse(raw).error ?? raw; }
                catch { failure = raw; }
              } catch { failure = error.message; }
            } else {
              failure = error.message;
            }
          }

          if (failure || !data?.url) {
            Alert.alert('No se pudo abrir', failure ?? 'Respuesta sin URL del portal.');
            return;
          }
          Linking.openURL(data.url);
        }}>
          <Ionicons name="settings-outline" size={16} color="#4A1B0C" />
          <Text style={styles.manageButtonText}>
            Administrar o cancelar mi suscripción
          </Text>
        </Pressable>
      )}

      {(tier === 'free' || isTrial) && STORE_BUILD && (
        <>
          <Text style={styles.storeHint}>
            Para suscribirte, visita nuestra página de planes y precios —
            ahí puedes elegir mensual o anual y completar tu pago de forma
            segura.
          </Text>
          <Pressable
            style={styles.webButton}
            onPress={() => {
              const url = slug
                ? `${KAHVE_SUBSCRIBE_PAGE}?slug=${encodeURIComponent(slug)}`
                : KAHVE_SUBSCRIBE_PAGE;
              Linking.openURL(url);
            }}
          >
            <Ionicons name="globe-outline" size={17} color="#4A1B0C" />
            <Text style={styles.webButtonText}>Ver planes y precios</Text>
            <Ionicons name="open-outline" size={15} color="#B27358" />
          </Pressable>
        </>
      )}

      {(tier === 'free' || isTrial) && !STORE_BUILD && (
        <>
          <Pressable style={styles.planButton}
            onPress={() => subscribe(STRIPE_LINK_MONTHLY)}>
            <Text style={styles.planPrice}>$249 <Text style={styles.planPer}>MXN/mes</Text></Text>
            <Text style={styles.planLabel}>Suscripción mensual</Text>
          </Pressable>
          <Pressable style={[styles.planButton, styles.planButtonBest]}
            onPress={() => subscribe(STRIPE_LINK_YEARLY)}>
            <View style={styles.bestBadge}>
              <Text style={styles.bestBadgeText}>2 MESES GRATIS</Text>
            </View>
            <Text style={[styles.planPrice, { color: '#FAECE7' }]}>
              $2,490 <Text style={[styles.planPer, { color: '#F5C4B3' }]}>MXN/año</Text>
            </Text>
            <Text style={[styles.planLabel, { color: '#F0997B' }]}>Suscripción anual</Text>
          </Pressable>

          <Text style={styles.hint}>
            El pago se procesa de forma segura con Stripe en tu navegador.
            Tu plan se activa automáticamente en cuanto se confirma —
            regresa a la app y listo.
          </Text>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 14, backgroundColor: '#fff', flexGrow: 1 },
  hero: {
    backgroundColor: '#4A1B0C', borderRadius: 16, padding: 22, alignItems: 'center',
  },
  heroTitle: { color: '#FAECE7', fontSize: 24, fontWeight: '800' },
  heroSub: { color: '#F5C4B3', fontSize: 13, marginTop: 6, textAlign: 'center' },
  benefits: {
    borderWidth: 1, borderColor: '#eee', borderRadius: 14, padding: 16, gap: 12,
  },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  benefitText: { flex: 1, fontSize: 13, color: '#333', lineHeight: 18 },
  planButton: {
    borderWidth: 1.5, borderColor: '#4A1B0C', borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
  },
  planButtonBest: { backgroundColor: '#4A1B0C', position: 'relative' },
  bestBadge: {
    position: 'absolute', top: -10, backgroundColor: '#F0997B',
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 2,
  },
  bestBadgeText: { fontSize: 10, fontWeight: '800', color: '#4A1B0C' },
  planPrice: { fontSize: 22, fontWeight: '800', color: '#4A1B0C' },
  planPer: { fontSize: 13, fontWeight: '600', color: '#888' },
  planLabel: { fontSize: 12, color: '#888', marginTop: 2 },
  hint: { fontSize: 11, color: '#999', textAlign: 'center', lineHeight: 16 },
  storeHint: {
    fontSize: 13, color: '#555', textAlign: 'center',
    lineHeight: 19, paddingHorizontal: 8, marginBottom: 4,
  },
  webButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1.5, borderColor: '#4A1B0C', borderRadius: 12,
    paddingVertical: 15,
  },
  webButtonText: { fontSize: 14.5, color: '#4A1B0C', fontWeight: '700' },
  manageButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1, borderColor: '#ddd', borderRadius: 12,
    paddingVertical: 14, marginTop: 4,
  },
  manageButtonText: { fontSize: 13, color: '#4A1B0C', fontWeight: '600' },
});

import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import {
  ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { PurchasesPackage } from 'react-native-purchases';
import { useAuth } from '../../lib/auth';
import { usePlan } from '../../lib/plan';
import {
  getProPackages,
  hasProEntitlement,
  openSubscriptionManagement,
  purchaseProPackage,
  restoreProPurchases,
} from '../../lib/revenuecat';

const BENEFITS = [
  ['people', 'Empleados ilimitados (el gratuito incluye 3)'],
  ['bar-chart', 'Reportes por semana, mes y año'],
  ['share-social', 'Exportar reportes y enviar tickets por WhatsApp'],
  ['tv', 'Tablero de órdenes listas para tus clientes'],
  ['image', 'Fotos en tus productos'],
] as const;

function packageLabel(selectedPackage: PurchasesPackage) {
  if (selectedPackage.packageType === 'ANNUAL') return 'Suscripción anual';
  if (selectedPackage.packageType === 'MONTHLY') return 'Suscripción mensual';
  return selectedPackage.product.title;
}

export default function Upgrade() {
  const { employee } = useAuth();
  const { tier, isTrial, daysLeft } = usePlan(employee);
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyPackage, setBusyPackage] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!employee) return;
      if (employee.role !== 'admin') {
        router.back();
        return;
      }

      let active = true;
      setLoading(true);
      getProPackages(employee.organization_id)
        .then((availablePackages) => {
          if (active) setPackages(availablePackages);
        })
        .catch((error) => {
          if (active) Alert.alert('No se pudieron cargar los planes', error.message);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => { active = false; };
    }, [employee?.organization_id, employee?.role]),
  );

  const purchase = async (selectedPackage: PurchasesPackage) => {
    if (!employee) return;
    setBusyPackage(selectedPackage.identifier);
    try {
      const customerInfo = await purchaseProPackage(
        employee.organization_id,
        selectedPackage,
      );
      if (hasProEntitlement(customerInfo)) {
        Alert.alert('Kahve Pro activado', 'Tu suscripción ya está activa.');
        router.back();
      }
    } catch (error: any) {
      if (!error?.userCancelled) {
        Alert.alert('No se completó la compra', error?.message ?? 'Inténtalo de nuevo.');
      }
    } finally {
      setBusyPackage(null);
    }
  };

  const restore = async () => {
    if (!employee) return;
    setBusyPackage('restore');
    try {
      const customerInfo = await restoreProPurchases(employee.organization_id);
      const restored = hasProEntitlement(customerInfo);
      Alert.alert(
        restored ? 'Compra restaurada' : 'Sin compras activas',
        restored
          ? 'Kahve Pro vuelve a estar activo.'
          : 'No encontramos una suscripción activa para esta cuenta.',
      );
    } catch (error: any) {
      Alert.alert('No se pudo restaurar', error?.message ?? 'Inténtalo de nuevo.');
    } finally {
      setBusyPackage(null);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>Kahve Pro</Text>
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

      {tier === 'pro' && !isTrial ? (
        <Pressable style={styles.manageButton} onPress={async () => {
          if (!employee) return;
          try {
            await openSubscriptionManagement(employee.organization_id);
          } catch (error: any) {
            Alert.alert('No se pudo abrir', error?.message ?? 'Inténtalo de nuevo.');
          }
        }}>
          <Ionicons name="settings-outline" size={16} color="#4A1B0C" />
          <Text style={styles.manageButtonText}>Administrar suscripción</Text>
        </Pressable>
      ) : loading ? (
        <ActivityIndicator color="#4A1B0C" />
      ) : packages.length === 0 ? (
        <Text style={styles.hint}>
          No hay planes disponibles. Revisa el offering actual en RevenueCat.
        </Text>
      ) : (
        packages.map((selectedPackage) => (
          <Pressable
            key={selectedPackage.identifier}
            style={styles.planButton}
            disabled={busyPackage !== null}
            onPress={() => purchase(selectedPackage)}
          >
            {busyPackage === selectedPackage.identifier ? (
              <ActivityIndicator color="#4A1B0C" />
            ) : (
              <>
                <Text style={styles.planPrice}>{selectedPackage.product.priceString}</Text>
                <Text style={styles.planLabel}>{packageLabel(selectedPackage)}</Text>
              </>
            )}
          </Pressable>
        ))
      )}

      <Pressable
        style={styles.restoreButton}
        disabled={busyPackage !== null}
        onPress={restore}
      >
        <Text style={styles.restoreText}>
          {busyPackage === 'restore' ? 'Restaurando…' : 'Restaurar compras'}
        </Text>
      </Pressable>
      <Text style={styles.hint}>
        El cobro y la renovación se administran de forma segura desde tu tienda.
      </Text>
      <View style={styles.legalLinks}>
        <Pressable onPress={() => router.push('/(app)/terminos')}>
          <Text style={styles.legalLink}>Términos de uso</Text>
        </Pressable>
        <Text style={styles.legalSeparator}>·</Text>
        <Pressable onPress={() => router.push('/(app)/privacidad')}>
          <Text style={styles.legalLink}>Aviso de privacidad</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 14, backgroundColor: '#fff', flexGrow: 1 },
  hero: {
    backgroundColor: '#4A1B0C', borderRadius: 8, padding: 22, alignItems: 'center',
  },
  heroTitle: { color: '#FAECE7', fontSize: 24, fontWeight: '800' },
  heroSub: { color: '#F5C4B3', fontSize: 13, marginTop: 6, textAlign: 'center' },
  benefits: { borderWidth: 1, borderColor: '#eee', borderRadius: 8, padding: 16, gap: 12 },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  benefitText: { flex: 1, fontSize: 13, color: '#333', lineHeight: 18 },
  planButton: {
    minHeight: 72, borderWidth: 1.5, borderColor: '#4A1B0C', borderRadius: 8,
    paddingVertical: 14, alignItems: 'center', justifyContent: 'center',
  },
  planPrice: { fontSize: 20, fontWeight: '800', color: '#4A1B0C' },
  planLabel: { fontSize: 12, color: '#777', marginTop: 2 },
  hint: { fontSize: 11, color: '#777', textAlign: 'center', lineHeight: 16 },
  manageButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingVertical: 14,
  },
  manageButtonText: { fontSize: 13, color: '#4A1B0C', fontWeight: '600' },
  restoreButton: { alignItems: 'center', paddingVertical: 10 },
  restoreText: { color: '#4A1B0C', fontSize: 13, fontWeight: '600' },
  legalLinks: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  legalLink: { color: '#4A1B0C', fontSize: 11, textDecorationLine: 'underline' },
  legalSeparator: { color: '#999', fontSize: 11 },
});
import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from './supabase';
import type { Employee } from '../types/db';

export type PlanTier = 'free' | 'pro';

// ============================================================
// PEGA AQUÍ TUS PAYMENT LINKS DE STRIPE (sin parámetros extra).
// La app les agrega ?client_reference_id=<slug> automáticamente.
// Mientras estén en sandbox usa los links test_; al pasar a live
// los reemplazas por los links reales.
// ============================================================
// En builds para tiendas (Play/App Store) la compra con link externo
// viola las políticas de pagos; se muestra contacto en su lugar.
export const STORE_BUILD = process.env.EXPO_PUBLIC_STORE_BUILD === '1';

export const STRIPE_LINK_MONTHLY = 'https://buy.stripe.com/test_cNieVc12V0P0dOscggcEw00';
export const STRIPE_LINK_YEARLY = 'https://buy.stripe.com/test_9B66oG26ZcxI5hW944cEw01';

// Límites del plan gratuito (espejo de lo que valida el servidor)
export const FREE_MAX_EMPLOYEES = 3;

interface OrgPlanRow { plan: string; trial_ends_at: string | null }

export function effectiveTier(org: OrgPlanRow | null): PlanTier {
  if (!org) return 'free';
  if (org.plan === 'pro') return 'pro';
  if (org.plan === 'trial' && org.trial_ends_at
      && new Date(org.trial_ends_at) > new Date()) return 'pro';
  return 'free';
}

export function trialDaysLeft(org: OrgPlanRow | null): number | null {
  if (!org || org.plan !== 'trial' || !org.trial_ends_at) return null;
  const ms = new Date(org.trial_ends_at).getTime() - Date.now();
  return ms > 0 ? Math.ceil(ms / 86_400_000) : 0;
}

// Hook: plan efectivo de la organización, refrescado por foco
export function usePlan(employee: Employee | null) {
  const [org, setOrg] = useState<OrgPlanRow | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      if (!employee) return;
      supabase
        .from('organizations')
        .select('plan, trial_ends_at')
        .eq('id', employee.organization_id)
        .single()
        .then(({ data }) => {
          setOrg(data);
          setLoading(false);
        });
    }, [employee?.organization_id]),
  );

  return {
    tier: effectiveTier(org),
    isTrial: org?.plan === 'trial' && effectiveTier(org) === 'pro',
    daysLeft: trialDaysLeft(org),
    loading,
  };
}

// Mensaje estándar cuando una función Pro está bloqueada
export function proFeatureAlert(featureDescription: string) {
  Alert.alert(
    'Función de Kahve Pro',
    `${featureDescription} forma parte del plan Pro. ` +
    'Contacta a soporte para activar tu suscripción.',
  );
}

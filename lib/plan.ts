import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from './supabase';
import type { Employee } from '../types/db';

export type PlanTier = 'free' | 'pro';

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

// RevenueCat procesa las compras mediante StoreKit y Google Play Billing.
export const HIDE_PRO_UI = false;

// Mensaje estándar cuando una función Pro está bloqueada
export function proFeatureAlert(featureDescription: string) {
  Alert.alert(
    'Función de Kahve Pro',
    `${featureDescription} forma parte del plan Pro. ` +
    'Contacta a soporte para activar tu suscripción.',
  );
}

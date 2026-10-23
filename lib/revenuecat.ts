import { Platform } from 'react-native';
import Purchases, {
  LOG_LEVEL,
  type CustomerInfo,
  type PurchasesPackage,
} from 'react-native-purchases';
import { supabase } from './supabase';

export const REVENUECAT_ENTITLEMENT = 'pro';

let configuredOrganizationId: string | null = null;

function platformApiKey() {
  if (Platform.OS === 'ios') return process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
  if (Platform.OS === 'android') return process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;
  return undefined;
}

export async function configureRevenueCat(organizationId: string) {
  const apiKey = platformApiKey();
  if (!apiKey) {
    throw new Error('RevenueCat no está configurado para esta plataforma.');
  }

  if (!configuredOrganizationId) {
    if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.DEBUG);
    Purchases.configure({ apiKey, appUserID: organizationId });
    configuredOrganizationId = organizationId;
    return;
  }

  if (configuredOrganizationId !== organizationId) {
    await Purchases.logIn(organizationId);
    configuredOrganizationId = organizationId;
  }
}

export async function getProPackages(organizationId: string) {
  await configureRevenueCat(organizationId);
  const offerings = await Purchases.getOfferings();
  return offerings.current?.availablePackages ?? [];
}

export async function purchaseProPackage(
  organizationId: string,
  selectedPackage: PurchasesPackage,
) {
  await configureRevenueCat(organizationId);
  const { customerInfo } = await Purchases.purchasePackage(selectedPackage);
  await syncRevenueCatPlan().catch((error) => {
    console.warn('La compra se completó, pero el plan aún no se sincronizó:', error);
  });
  return customerInfo;
}

export async function restoreProPurchases(organizationId: string) {
  await configureRevenueCat(organizationId);
  const customerInfo = await Purchases.restorePurchases();
  await syncRevenueCatPlan().catch((error) => {
    console.warn('La restauración se completó, pero el plan aún no se sincronizó:', error);
  });
  return customerInfo;
}

export function hasProEntitlement(customerInfo: CustomerInfo) {
  return Boolean(customerInfo.entitlements.active[REVENUECAT_ENTITLEMENT]);
}

export async function openSubscriptionManagement(organizationId: string) {
  await configureRevenueCat(organizationId);
  await Purchases.showManageSubscriptions();
}

async function syncRevenueCatPlan() {
  const { error } = await supabase.functions.invoke('revenuecat-sync');
  if (error) throw error;
}
import { useEffect } from 'react';
import { useAuth } from '../lib/auth';
import { configureRevenueCat } from '../lib/revenuecat';

export default function RevenueCatSetup() {
  const { employee } = useAuth();

  useEffect(() => {
    if (!employee) return;
    configureRevenueCat(employee.organization_id).catch((error) => {
      console.warn('No se pudo configurar RevenueCat:', error);
    });
  }, [employee?.organization_id]);

  return null;
}
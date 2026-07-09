import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { Employee, Shift } from '../types/db';

// Devuelve el turno abierto de la sucursal del empleado.
// Para el admin sin sucursal asignada toma el primer turno abierto de su org.
export function useOpenShift(employee: Employee | null) {
  const [shift, setShift] = useState<Shift | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!employee) return;
    setLoading(true);
    let query = supabase
      .from('shifts')
      .select('*')
      .eq('status', 'abierto')
      .order('opened_at', { ascending: false })
      .limit(1);
    if (employee.branch_id) query = query.eq('branch_id', employee.branch_id);
    const { data } = await query;
    setShift(data?.[0] ?? null);
    setLoading(false);
  }, [employee]);

  useEffect(() => { refresh(); }, [refresh]);

  return { shift, loading, refresh };
}

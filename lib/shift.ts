import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { supabase } from './supabase';
import type { Employee, Shift } from '../types/db';

// Devuelve el turno abierto de ESTE empleado (no el de la sucursal en
// general). Antes solo se filtraba por sucursal y se tomaba "el turno
// abierto más reciente" — si otro cajero, supervisor o el admin abría su
// propio turno mientras el primero seguía trabajando, esta pantalla
// empezaba a mostrar el turno ajeno en el siguiente refresh (al entrar o
// salir de Cobrar / Corte de caja), y parecía que la caja "se reiniciaba
// sola" o "cambiaba de turno" sin que nadie la hubiera cerrado. Filtrar
// por employee_id además de por sucursal evita que un turno abierto por
// otra persona se cuele en la pantalla de este empleado.
// Para el admin sin sucursal asignada toma su turno abierto en cualquier
// sucursal de la org.
// Se refresca cada vez que la pantalla recupera el foco (al volver de
// otra pantalla), no solo al montarse.
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
      .eq('employee_id', employee.id)
      .order('opened_at', { ascending: false })
      .limit(1);
    if (employee.branch_id) query = query.eq('branch_id', employee.branch_id);
    const { data } = await query;
    setShift(data?.[0] ?? null);
    setLoading(false);
  }, [employee]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  return { shift, loading, refresh };
}

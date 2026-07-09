import type { EmployeeRole } from '../types/db';

export type Permission =
  | 'pos.sell'          // tomar órdenes y cobrar
  | 'queue.view'        // ver cola de preparación
  | 'queue.prepare'     // iniciar / marcar lista
  | 'orders.cancel'     // cancelar órdenes cobradas
  | 'reports.view'      // ver reportes
  | 'menu.edit'         // editar menú y precios
  | 'team.manage';      // gestionar empleados

const ROLE_PERMISSIONS: Record<EmployeeRole, Permission[]> = {
  barista: ['queue.view', 'queue.prepare'],
  cajero: ['pos.sell', 'queue.view'],
  supervisor: ['pos.sell', 'queue.view', 'queue.prepare', 'orders.cancel', 'reports.view'],
  admin: [
    'pos.sell', 'queue.view', 'queue.prepare', 'orders.cancel',
    'reports.view', 'menu.edit', 'team.manage',
  ],
};

export function can(role: EmployeeRole | null, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role].includes(permission);
}

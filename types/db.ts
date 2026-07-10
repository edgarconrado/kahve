export type EmployeeRole = 'admin' | 'supervisor' | 'cajero' | 'barista';

export type OrderStatus =
  | 'abierta' | 'pagada' | 'en_preparacion'
  | 'lista' | 'entregada' | 'cancelada';

export type OrderType = 'local' | 'llevar';
export type PaymentMethod = 'efectivo' | 'tarjeta' | 'transferencia';
export type CardType = 'debito' | 'credito';
export type ShiftStatus = 'abierto' | 'cerrado';

export interface Employee {
  id: string;
  auth_user_id: string | null;
  organization_id: string;
  branch_id: string | null; // null = admin con acceso a toda la organización
  full_name: string;
  email: string | null;
  role: EmployeeRole;
  is_active: boolean;
}

export interface Product {
  id: string;
  organization_id: string;
  branch_id: string;
  category_id: string;
  name: string;
  description: string | null;
  base_price: number;
  is_available: boolean;
  sort_order: number;
  image_url: string | null;
}

export interface Modifier {
  id: string;
  product_id: string;
  name: string;
  price_delta: number;
  is_active?: boolean;
}

export interface Shift {
  id: string;
  organization_id: string;
  branch_id: string;
  employee_id: string;
  status: ShiftStatus;
  opening_cash: number;
  opened_at: string;
}

export interface Order {
  id: string;
  organization_id: string;
  branch_id: string;
  shift_id: string;
  order_number: number;
  customer_name: string | null;
  order_type: OrderType;
  status: OrderStatus;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  created_at: string;
}

import { create } from 'zustand';
import type { Modifier, Product } from '../types/db';

export interface CartLine {
  lineId: string;
  product: Product;
  modifiers: Modifier[];
  quantity: number;
  notes?: string;
}

interface CartState {
  lines: CartLine[];
  customerName: string;
  orderType: 'local' | 'llevar';
  add: (product: Product, modifiers?: Modifier[]) => void;
  remove: (lineId: string) => void;
  setQuantity: (lineId: string, qty: number) => void;
  setCustomerName: (name: string) => void;
  setOrderType: (t: 'local' | 'llevar') => void;
  clear: () => void;
  subtotal: () => number;
}

const IVA = 0.16;

export const useCart = create<CartState>((set, get) => ({
  lines: [],
  customerName: '',
  orderType: 'llevar',
  add: (product, modifiers = []) =>
    set((s) => ({
      lines: [
        ...s.lines,
        { lineId: `${product.id}-${Date.now()}`, product, modifiers, quantity: 1 },
      ],
    })),
  remove: (lineId) => set((s) => ({ lines: s.lines.filter((l) => l.lineId !== lineId) })),
  setQuantity: (lineId, qty) =>
    set((s) => ({
      lines: s.lines.map((l) => (l.lineId === lineId ? { ...l, quantity: qty } : l)),
    })),
  setCustomerName: (customerName) => set({ customerName }),
  setOrderType: (orderType) => set({ orderType }),
  clear: () => set({ lines: [], customerName: '', orderType: 'llevar' }),
  subtotal: () =>
    get().lines.reduce((acc, l) => {
      const mods = l.modifiers.reduce((m, x) => m + x.price_delta, 0);
      return acc + (l.product.base_price + mods) * l.quantity;
    }, 0),
}));

export const cartTotals = (subtotal: number) => {
  const tax = +(subtotal * IVA).toFixed(2);
  return { tax, total: +(subtotal + tax).toFixed(2) };
};

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
  add: (product: Product, modifiers?: Modifier[], quantity?: number, notes?: string) => void;
  decrement: (productId: string) => void;
  remove: (lineId: string) => void;
  setQuantity: (lineId: string, qty: number) => void;
  setCustomerName: (name: string) => void;
  setOrderType: (t: 'local' | 'llevar') => void;
  clear: () => void;
  subtotal: () => number;
}

const IVA = 0.16;

export const lineUnitPrice = (line: Pick<CartLine, 'product' | 'modifiers'>) =>
  line.product.base_price + line.modifiers.reduce((a, m) => a + m.price_delta, 0);

export const useCart = create<CartState>((set, get) => ({
  lines: [],
  customerName: '',
  orderType: 'llevar',
  add: (product, modifiers = [], quantity = 1, notes) =>
    set((s) => ({
      lines: [
        ...s.lines,
        {
          lineId: `${product.id}-${Date.now()}`,
          product,
          modifiers,
          quantity,
          notes,
        },
      ],
    })),
  // Quita una unidad del ÚLTIMO renglón de ese producto (deshace el
  // último toque). Si el renglón queda en cero, se elimina.
  decrement: (productId) =>
    set((s) => {
      const idx = [...s.lines].reverse()
        .findIndex((l) => l.product.id === productId);
      if (idx === -1) return s;
      const realIdx = s.lines.length - 1 - idx;
      const line = s.lines[realIdx];
      if (line.quantity > 1) {
        return {
          lines: s.lines.map((l, i) =>
            i === realIdx ? { ...l, quantity: l.quantity - 1 } : l),
        };
      }
      return { lines: s.lines.filter((_, i) => i !== realIdx) };
    }),
  remove: (lineId) => set((s) => ({ lines: s.lines.filter((l) => l.lineId !== lineId) })),
  setQuantity: (lineId, qty) =>
    set((s) => ({
      lines: s.lines.map((l) => (l.lineId === lineId ? { ...l, quantity: qty } : l)),
    })),
  setCustomerName: (customerName) => set({ customerName }),
  setOrderType: (orderType) => set({ orderType }),
  clear: () => set({ lines: [], customerName: '', orderType: 'llevar' }),
  subtotal: () =>
    get().lines.reduce((acc, l) => acc + lineUnitPrice(l) * l.quantity, 0),
}));

// Los precios del menú YA incluyen IVA. El total es la suma tal cual;
// el desglose se calcula hacia atrás: base = total / 1.16.
export const cartTotals = (gross: number) => {
  const total = +gross.toFixed(2);
  const subtotal = +(total / (1 + IVA)).toFixed(2);
  const tax = +(total - subtotal).toFixed(2); // garantiza subtotal + tax = total
  return { subtotal, tax, total };
};

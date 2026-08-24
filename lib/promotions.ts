import { lineUnitPrice, type CartLine } from '../store/cart';

export interface PromotionRow {
  id: string;
  name: string;
  scope: 'product' | 'category' | 'combo';
  product_id: string | null;
  category_id: string | null;
  buy_quantity: number | null;
  discount_percent: number;
  is_active: boolean;
  // Solo para scope='combo':
  trigger_product_id: string | null;
  trigger_quantity: number | null;
  reward_product_id: string | null;
}

export interface AppliedPromotion {
  name: string;
  discountAmount: number;
  timesApplied: number; // cuántos "grupos" (o combos) se completaron
}

export interface PromotionResult {
  totalSavings: number;
  applied: AppliedPromotion[];
}

interface Instance { unitPrice: number; productId: string; categoryId: string }

function expandInstances(lines: CartLine[]): Instance[] {
  const out: Instance[] = [];
  for (const l of lines) {
    const price = lineUnitPrice(l);
    for (let i = 0; i < l.quantity; i++) {
      out.push({ unitPrice: price, productId: l.product.id, categoryId: l.product.category_id });
    }
  }
  return out;
}

// El más barato de cada grupo completo de N unidades recibe el % de
// descuento. Se ordena de mayor a menor precio para que, entre varias
// unidades que califican, el negocio siempre descuente la más barata
// del grupo, nunca la de mayor margen.
function applyToInstances(instances: Instance[], buyQuantity: number, discountPercent: number) {
  const sorted = [...instances].sort((a, b) => b.unitPrice - a.unitPrice);
  const groups = Math.floor(sorted.length / buyQuantity);
  let savings = 0;
  for (let g = 0; g < groups; g++) {
    const chunk = sorted.slice(g * buyQuantity, (g + 1) * buyQuantity);
    const cheapest = chunk[chunk.length - 1]; // el último del bloque descendente
    savings += cheapest.unitPrice * (discountPercent / 100);
  }
  return { savings: +savings.toFixed(2), groups };
}

// Calcula automáticamente qué promociones activas aplican al carrito
// actual. Regla de precedencia: si un producto tiene su PROPIA promoción
// (scope='product'), esa manda y el producto queda fuera de cualquier
// promoción de categoría — evita que un mismo café cuente doble.
// Los combos (scope='combo') se resuelven aparte, sobre instancias del
// producto "premio" que no hayan sido ya usadas por otro combo.
export function computePromotions(
  lines: CartLine[],
  promotions: PromotionRow[],
): PromotionResult {
  let pool = expandInstances(lines);
  const applied: AppliedPromotion[] = [];
  let totalSavings = 0;

  const productPromos = promotions.filter((p) => p.is_active && p.scope === 'product');
  const categoryPromos = promotions.filter((p) => p.is_active && p.scope === 'category');
  const comboPromos = promotions.filter((p) => p.is_active && p.scope === 'combo');
  const productIdsWithOwnPromo = new Set(productPromos.map((p) => p.product_id));

  for (const promo of productPromos) {
    const matching = pool.filter((i) => i.productId === promo.product_id);
    if (!promo.buy_quantity || matching.length < promo.buy_quantity) continue;
    const { savings, groups } = applyToInstances(matching, promo.buy_quantity, promo.discount_percent);
    if (savings > 0) {
      applied.push({ name: promo.name, discountAmount: savings, timesApplied: groups });
      totalSavings += savings;
    }
  }
  // Los productos con promo propia quedan resueltos; no participan
  // también en una promoción de categoría.
  pool = pool.filter((i) => !productIdsWithOwnPromo.has(i.productId));

  for (const promo of categoryPromos) {
    const matching = pool.filter((i) => i.categoryId === promo.category_id);
    if (!promo.buy_quantity || matching.length < promo.buy_quantity) continue;
    const { savings, groups } = applyToInstances(matching, promo.buy_quantity, promo.discount_percent);
    if (savings > 0) {
      applied.push({ name: promo.name, discountAmount: savings, timesApplied: groups });
      totalSavings += savings;
    }
  }

  // Combos: "compra A (x veces), obtén B con descuento". Se calculan
  // sobre el carrito COMPLETO (no sobre el pool ya recortado arriba),
  // porque el producto que dispara el combo (café) suele ser distinto
  // al que se premia (dona), y no queremos que una promo de categoría
  // sobre los cafés interfiera con esto.
  const allInstances = expandInstances(lines);
  // Cuántas unidades del producto premio ya se usaron en otro combo,
  // para no regalar más donas de las que hay en el carrito si dos
  // combos compiten por el mismo producto premio.
  const rewardUsed: Record<string, number> = {};

  for (const promo of comboPromos) {
    if (!promo.trigger_product_id || !promo.reward_product_id) continue;
    const triggerQty = promo.trigger_quantity ?? 1;

    const triggerCount = allInstances.filter((i) => i.productId === promo.trigger_product_id).length;
    const timesTriggered = Math.floor(triggerCount / triggerQty);
    if (timesTriggered === 0) continue;

    const rewardInstances = allInstances.filter((i) => i.productId === promo.reward_product_id);
    const alreadyUsed = rewardUsed[promo.reward_product_id] ?? 0;
    const availableRewards = rewardInstances.length - alreadyUsed;
    if (availableRewards <= 0) continue;

    // El combo aplica tantas veces como el trigger lo permita, topado
    // por cuántas unidades del premio realmente hay en el carrito.
    const timesApplied = Math.min(timesTriggered, availableRewards);
    if (timesApplied <= 0) continue;

    // Se descuentan las unidades del premio más BARATAS primero (incluso
    // si todas cuestan lo mismo, da igual) — mismo criterio conservador
    // que el resto del sistema.
    const sortedRewards = [...rewardInstances]
      .sort((a, b) => a.unitPrice - b.unitPrice)
      .slice(alreadyUsed, alreadyUsed + timesApplied);

    const savings = +(sortedRewards.reduce(
      (a, r) => a + r.unitPrice * (promo.discount_percent / 100), 0,
    )).toFixed(2);

    if (savings > 0) {
      applied.push({ name: promo.name, discountAmount: savings, timesApplied });
      totalSavings += savings;
      rewardUsed[promo.reward_product_id] = alreadyUsed + timesApplied;
    }
  }

  return { totalSavings: +totalSavings.toFixed(2), applied };
}

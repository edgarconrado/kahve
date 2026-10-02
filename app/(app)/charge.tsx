import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import {
  Alert, Animated, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput,
  View, KeyboardAvoidingView, Platform, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { usePlan, proFeatureAlert } from '../../lib/plan';
import { printReceipt } from '../../lib/printer';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { useOpenShift } from '../../lib/shift';
import { useCart, cartTotals, lineUnitPrice } from '../../store/cart';
import { computePromotions, type PromotionRow } from '../../lib/promotions';
import type { CardType, PaymentMethod } from '../../types/db';

// Montos rápidos: redondeos hacia arriba útiles + billetes comunes
function quickAmounts(total: number): number[] {
  const roundedTen = Math.ceil(total / 10) * 10;
  const roundedFifty = Math.ceil(total / 50) * 50;
  const options = [roundedTen, roundedFifty, roundedFifty + 50, 500, 1000];
  return [...new Set(options)].filter((x) => x >= total).slice(0, 4);
}

interface ChargeProps {
  embedded?: boolean;
  onClose?: () => void;
}

export default function Charge({ embedded = false, onClose }: ChargeProps) {
  const { width } = useWindowDimensions();
  const screenAnimation = useRef(new Animated.Value(embedded ? 1 : 0)).current;
  // En pantallas anchas (tablets, landscape) el formulario se centra con un
  // ancho máximo cómodo de leer, en vez de estirarse de borde a borde.
  const isWide = width >= 700;
  const { employee } = useAuth();
  const { shift } = useOpenShift(employee);
  const cart = useCart();

  const [method, setMethod] = useState<PaymentMethod>('efectivo');
  const [cardType, setCardType] = useState<CardType>('debito');
  const [received, setReceived] = useState<number | null>(null);
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (embedded) return;
    Animated.timing(screenAnimation, {
      toValue: 1,
      duration: 240,
      useNativeDriver: true,
    }).start();
  }, [embedded, screenAnimation]);

  const [discount, setDiscount] = useState(0);
  const [showDiscount, setShowDiscount] = useState(false);
  const [customDiscount, setCustomDiscount] = useState('');
  const [taxRate, setTaxRate] = useState(16);

  const { tier } = usePlan(employee);
  const [tip, setTip] = useState(0);
  const [customTip, setCustomTip] = useState('');

  const [customerPhone, setCustomerPhone] = useState('');
  const [loyaltyStatus, setLoyaltyStatus] = useState<{
    qualifies: boolean; visits_count: number; visits_required: number;
    reward_product_id: string; reward_product_name: string; discount_percent: number;
  } | null>(null);
  const [loyaltyApplied, setLoyaltyApplied] = useState(false);
  const [checkingLoyalty, setCheckingLoyalty] = useState(false);

  const checkLoyalty = async (phone: string) => {
    if (!shift || phone.trim().length < 8) { setLoyaltyStatus(null); return; }
    setCheckingLoyalty(true);
    const { data } = await supabase.rpc('check_loyalty_status', {
      p_branch_id: shift.branch_id, p_phone: phone.trim(),
    });
    setLoyaltyStatus(data?.[0]?.reward_product_id ? data[0] : null);
    setCheckingLoyalty(false);
  };

  // Se dispara solo, medio segundo después de que el cajero deja de
  // teclear — así no depende de que el campo pierda el foco (si va
  // directo a "Cobrar" sin tocar otro campo, antes nunca se enteraba).
  useEffect(() => {
    const timer = setTimeout(() => checkLoyalty(customerPhone), 500);
    return () => clearTimeout(timer);
  }, [customerPhone, shift?.branch_id]);

  // El descuento de lealtad solo se aplica a UNA unidad del producto de
  // premio, y solo si ese producto ya está en el ticket — no se agrega
  // solo, el cajero debe agregarlo como cualquier venta normal.
  const loyaltyDiscount = useMemo(() => {
    if (!loyaltyApplied || !loyaltyStatus?.qualifies) return 0;
    const rewardLine = cart.lines.find((l) => l.product.id === loyaltyStatus.reward_product_id);
    if (!rewardLine) return 0;
    return +(lineUnitPrice(rewardLine) * (loyaltyStatus.discount_percent / 100)).toFixed(2);
  }, [loyaltyApplied, loyaltyStatus, cart.lines]);

  const [promotions, setPromotions] = useState<PromotionRow[]>([]);
  // useFocusEffect (no useEffect simple) para que las promociones se
  // vuelvan a pedir CADA VEZ que el cajero entra a cobrar — no solo la
  // primera vez que se abrió esta pantalla en la sesión. Sin esto, una
  // promoción creada o activada por el admin mientras el cajero ya tenía
  // la app abierta nunca se detectaba hasta cerrar sesión y volver a
  // entrar (que fuerza a toda la app a recargar desde cero).
  useFocusEffect(
    useCallback(() => {
      if (tier !== 'pro') { setPromotions([]); return; }
      supabase
        .from('promotions')
        .select('id, name, scope, product_id, category_id, buy_quantity, discount_percent, is_active, trigger_product_id, trigger_quantity, reward_product_id')
        .eq('is_active', true)
        .then(({ data }) => setPromotions((data as PromotionRow[]) ?? []));
    }, [tier]),
  );

  useFocusEffect(
    useCallback(() => {
      if (!employee?.organization_id) return;
      supabase
        .from('organizations')
        .select('tax_rate')
        .eq('id', employee.organization_id)
        .single()
        .then(({ data }) => setTaxRate(Number(data?.tax_rate ?? 16)));
    }, [employee?.organization_id]),
  );

  const gross = cart.subtotal();
  // Las promociones se aplican SIEMPRE primero, automático — no cuentan
  // contra el límite de descuento manual del cajero, porque no fue él
  // quien decidió darlas.
  const { totalSavings: promoDiscount, applied: appliedPromotions } = useMemo(
    () => computePromotions(cart.lines, promotions),
    [cart.lines, promotions],
  );
  const afterAutomatic = Math.max(+(gross - promoDiscount - loyaltyDiscount).toFixed(2), 0);
  const discounted = Math.max(+(afterAutomatic - discount).toFixed(2), 0);
  const taxRatePercent = Math.min(Math.max(taxRate, 0), 100);
  const { subtotal, tax, total } = cartTotals(discounted, taxRatePercent);
  // La propina se suma al cobro pero NO es venta: viaja aparte en payments.tip
  const grandTotal = +(total + tip).toFixed(2);

  // Cajero: máximo 10% de descuento MANUAL adicional, calculado sobre lo
  // que el cliente ya pagaría con promo/lealtad aplicados (no sobre el
  // precio de lista, para no darle al cajero más margen del que debería).
  const maxDiscount = employee?.role === 'cajero' ? +(afterAutomatic * 0.10).toFixed(2) : afterAutomatic;

  const applyDiscount = (amount: number) => {
    const value = +amount.toFixed(2);
    if (value > maxDiscount) {
      Alert.alert(
        'Descuento no permitido',
        `Tu rol permite hasta $${maxDiscount.toFixed(2)} (10%). ` +
        'Un supervisor puede aplicar descuentos mayores.',
      );
      return;
    }
    setDiscount(Math.max(value, 0));
    setShowDiscount(false);
    setCustomDiscount('');
  };
  const amounts = useMemo(() => quickAmounts(grandTotal), [grandTotal]);
  const change = received !== null ? +(received - grandTotal).toFixed(2) : null;

  const canConfirm =
    cart.lines.length > 0 &&
    !busy &&
    !checkingLoyalty &&
    (method !== 'efectivo' || (received !== null && received >= grandTotal)) &&
    (method !== 'plataforma' || reference.trim().length > 0);

  const shareTicket = async (order: any, lines: typeof cart.lines, info: {
    total: number; tip: number; discount: number; promoDiscount: number; loyaltyDiscount: number;
    tax: number; method: string; received: number | null; change: number | null;
  }) => {
    try {
      const { data: org } = await supabase
        .from('organizations').select('name, logo_url').eq('id', employee!.organization_id).single();
      const rows = lines.map((l) => {
        const unit = lineUnitPrice(l);
        const mods = l.modifiers.length
          ? `<div style="color:#777;font-size:11px">${l.modifiers.map((m) => m.name).join(' · ')}</div>`
          : '';
        return `<tr>
          <td>${l.quantity}x ${l.product.name}${mods}</td>
          <td style="text-align:right;vertical-align:top">$${(unit * l.quantity).toFixed(2)}</td>
        </tr>`;
      }).join('');
      const methodLabel = info.method === 'tarjeta' ? 'Tarjeta'
        : info.method === 'transferencia' ? 'Transferencia' : 'Efectivo';
      const html = `
        <html><head><meta charset="utf-8"><style>
          body { font-family: -apple-system, Helvetica, sans-serif; color: #222;
                 max-width: 320px; margin: 0 auto; padding: 24px 16px; }
          h1 { font-size: 20px; color: #4A1B0C; text-align: center; margin: 0; }
          .sub { text-align: center; color: #888; font-size: 11px; margin: 4px 0 14px; }
          table { width: 100%; border-collapse: collapse; font-size: 13px; }
          td { padding: 5px 0; border-bottom: 1px dashed #eee; }
          .tot td { border-bottom: none; padding: 3px 0; font-size: 12px; color: #555; }
          .grand td { font-size: 16px; font-weight: 700; color: #222; padding-top: 8px; }
          .foot { text-align: center; color: #999; font-size: 11px; margin-top: 18px; }
        </style></head><body>
          ${org?.logo_url
            ? `<img src="${org.logo_url}" style="display:block;margin:0 auto 8px;width:64px;height:64px;border-radius:12px;object-fit:cover" />`
            : ''}
          <h1>${org?.name ?? 'Kahve'}</h1>
          <div class="sub">
            Ticket #${String(order.order_number).padStart(3, '0')}
            · ${new Date().toLocaleString('es-MX')}
            ${order.customer_name ? `<br>Cliente: ${order.customer_name}` : ''}
          </div>
          <table>${rows}</table>
          <table style="margin-top:10px">
            ${info.loyaltyDiscount > 0
              ? `<tr class="tot"><td>Cliente frecuente</td><td style="text-align:right">−$${info.loyaltyDiscount.toFixed(2)}</td></tr>` : ''}
            ${info.promoDiscount > 0
              ? `<tr class="tot"><td>Promoción</td><td style="text-align:right">−$${info.promoDiscount.toFixed(2)}</td></tr>` : ''}
            ${info.discount > 0
              ? `<tr class="tot"><td>Descuento</td><td style="text-align:right">−$${info.discount.toFixed(2)}</td></tr>` : ''}
            ${info.tax > 0
              ? `<tr class="tot"><td>IVA incluido</td><td style="text-align:right">$${info.tax.toFixed(2)}</td></tr>` : ''}
            ${info.tip > 0
              ? `<tr class="tot"><td>Propina</td><td style="text-align:right">$${info.tip.toFixed(2)}</td></tr>` : ''}
            <tr class="grand"><td>Total</td><td style="text-align:right">$${(info.total + info.tip).toFixed(2)}</td></tr>
            <tr class="tot"><td>Pago</td><td style="text-align:right">${methodLabel}</td></tr>
            ${info.received !== null
              ? `<tr class="tot"><td>Recibido</td><td style="text-align:right">$${info.received.toFixed(2)}</td></tr>
                 <tr class="tot"><td>Cambio</td><td style="text-align:right">$${(info.change ?? 0).toFixed(2)}</td></tr>` : ''}
          </table>
          <div class="foot">¡Gracias por tu visita! ☕</div>
        </body></html>`;
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Enviar ticket',
          UTI: 'com.adobe.pdf',
        });
      }
    } catch (e: any) {
      Alert.alert('No se pudo generar el ticket', e?.message ?? '');
    }
  };

  const printCurrentTicket = async (order: any, lines: typeof cart.lines, info: {
    total: number; tip: number; discount: number; promoDiscount: number; loyaltyDiscount: number;
    tax: number; method: string; received: number | null; change: number | null;
  }) => {
    try {
      const { data: org } = await supabase
        .from('organizations').select('name, logo_url').eq('id', employee!.organization_id).single();
      const methodLabel = info.method === 'tarjeta' ? 'Tarjeta'
        : info.method === 'transferencia' ? 'Transferencia' : 'Efectivo';
      await printReceipt({
        orgName: org?.name ?? 'Kahve',
        logoUrl: org?.logo_url ?? null,
        orderNumber: order.order_number,
        customerName: order.customer_name ?? null,
        createdAt: new Date(),
        lines: lines.map((l) => ({
          quantity: l.quantity,
          name: l.product.name,
          modifiers: l.modifiers.map((m) => m.name),
          total: lineUnitPrice(l) * l.quantity,
        })),
        discount: info.discount,
        promoDiscount: info.promoDiscount,
        loyaltyDiscount: info.loyaltyDiscount,
        tax: info.tax,
        tip: info.tip,
        total: info.total,
        method: methodLabel,
        received: info.received,
        change: info.change,
      });
    } catch (e: any) {
      Alert.alert(
        'No se pudo imprimir',
        e?.message ?? 'Revisa que la impresora esté encendida y conectada.',
      );
    }
  };

  const confirm = async () => {
    if (!employee || !shift) return;
    setBusy(true);

    const { data: order, error } = await supabase
      .from('orders')
      .insert({
        organization_id: employee.organization_id,
        branch_id: shift.branch_id,
        shift_id: shift.id,
        customer_name: cart.customerName || null,
        customer_phone: customerPhone.trim() || null,
        order_type: cart.orderType,
        status: 'pagada',
        subtotal,
        tax,
        discount,
        promo_discount: promoDiscount,
        loyalty_discount: loyaltyDiscount,
        loyalty_redeemed: loyaltyDiscount > 0,
        total,
        created_by: employee.id,
        paid_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error || !order) {
      setBusy(false);
      Alert.alert('Error', 'No se pudo registrar la orden.');
      return;
    }

    for (const line of cart.lines) {
      const { data: item } = await supabase
        .from('order_items')
        .insert({
          order_id: order.id,
          product_id: line.product.id,
          product_name: line.product.name,
          unit_price: lineUnitPrice(line),  // base + modificadores
          quantity: line.quantity,
          notes: line.notes ?? null,
        })
        .select()
        .single();

      if (item && line.modifiers.length > 0) {
        await supabase.from('order_item_modifiers').insert(
          line.modifiers.map((m) => ({
            order_item_id: item.id,
            modifier_name: m.name,
            price_delta: m.price_delta,
          })),
        );
        // Insumos extra de los modificadores elegidos (ej. "Leche
        // deslactosada"), sumados al costo ya congelado de la receta base.
        await supabase.rpc('consume_modifier_supplies', {
          p_order_item_id: item.id,
        });
      }
    }

    await supabase.from('payments').insert({
      organization_id: employee.organization_id,
      order_id: order.id,
      shift_id: shift.id,
      method,
      card_type: method === 'tarjeta' ? cardType : null,
      amount: total,
      tip,
      received: method === 'efectivo' ? received : null,
      change_due: method === 'efectivo' ? change : null,
      reference: reference || null,
      created_by: employee.id,
    });

    // Capturar lo necesario para el ticket ANTES de limpiar el carrito
    const ticketLines = [...cart.lines];
    const ticketInfo = { total, tip, discount, promoDiscount, loyaltyDiscount, tax, method, received, change };

    cart.clear();
    setBusy(false);

    // Reiniciar TODO el formulario de cobro para la siguiente venta.
    // Sin esto, si esta pantalla no se desmonta entre una venta y la
    // siguiente (algunas configuraciones de navegación reutilizan la
    // misma instancia), el monto recibido, el método de pago, la
    // propina y el descuento de la venta anterior se quedaban pegados
    // y aparecían de entrada en la venta nueva.
    setMethod('efectivo');
    setCardType('debito');
    setReceived(null);
    setReference('');
    setDiscount(0);
    setCustomDiscount('');
    setTip(0);
    setCustomTip('');
    setCustomerPhone('');
    setLoyaltyStatus(null);
    setLoyaltyApplied(false);
    const finish = () => embedded ? onClose?.() : router.back();
    Alert.alert(
      `Orden #${String(order.order_number).padStart(3, '0')}`,
      'Pago registrado. Enviada a preparación.',
      [
        {
          text: 'Imprimir',
          onPress: () => {
            printCurrentTicket(order, ticketLines, ticketInfo).finally(finish);
          },
        },
        {
          text: 'Enviar ticket',
          onPress: () => {
            if (tier === 'free') {
              proFeatureAlert('Enviar tickets por WhatsApp o correo');
              finish();
              return;
            }
            shareTicket(order, ticketLines, ticketInfo).finally(finish);
          },
        },
        { text: 'Listo', style: 'cancel', onPress: finish },
      ],
    );
  };

  return (
    <Animated.View style={[
      { flex: 1 },
      !embedded && {
        opacity: screenAnimation,
        transform: [{
          translateY: screenAnimation.interpolate({
            inputRange: [0, 1],
            outputRange: [24, 0],
          }),
        }],
      },
    ]}>
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1 }}
      keyboardVerticalOffset={90}
    >
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[
        styles.container,
        isWide && styles.containerWide,
      ]}>
      <View style={styles.totalBox}>
        <Text style={styles.totalLabel}>Total a cobrar</Text>
        <Text style={styles.totalValue}>${grandTotal.toFixed(2)}</Text>
        <Text style={styles.totalSub}>
          {[
            promoDiscount > 0 ? `Promo −$${promoDiscount.toFixed(2)}` : null,
            discount > 0 ? `Descuento −$${discount.toFixed(2)}` : null,
            tip > 0 ? `Venta $${total.toFixed(2)} + propina $${tip.toFixed(2)}` : null,
            tax > 0 ? `IVA ${taxRatePercent}% · $${tax.toFixed(2)}` : null,
          ].filter(Boolean).join(' · ')}
        </Text>
      </View>

      <View style={styles.saleSummary}>
        <View style={styles.saleSummaryHeader}>
          <Text style={styles.saleSummaryTitle}>Detalle de la venta</Text>
          <Text style={styles.saleSummaryCount}>
            {cart.lines.reduce((count, line) => count + line.quantity, 0)} artículos
          </Text>
        </View>
        {cart.lines.map((line) => {
          const unit = lineUnitPrice(line);
          return (
            <View key={line.lineId} style={styles.saleLine}>
              <View style={styles.saleLineInfo}>
                <Text style={styles.saleLineName} numberOfLines={1}>
                  {line.quantity}× {line.product.name}
                </Text>
                {line.modifiers.length > 0 && (
                  <Text style={styles.saleLineModifiers} numberOfLines={1}>
                    {line.modifiers.map((modifier) => modifier.name).join(' · ')}
                  </Text>
                )}
              </View>
              <Text style={styles.saleLineTotal}>
                ${(unit * line.quantity).toFixed(2)}
              </Text>
            </View>
          );
        })}
      </View>

      {appliedPromotions.length > 0 && (
        <View style={styles.promoBox}>
          {appliedPromotions.map((p) => (
            <View key={p.name} style={styles.promoRow}>
              <Ionicons name="pricetag" size={14} color="#0F6E56" />
              <Text style={styles.promoText}>
                {p.name}{p.timesApplied > 1 ? ` ×${p.timesApplied}` : ''}
              </Text>
              <Text style={styles.promoAmount}>−${p.discountAmount.toFixed(2)}</Text>
            </View>
          ))}
        </View>
      )}

      {loyaltyStatus && (
        <View style={styles.loyaltyBox}>
          {loyaltyStatus.qualifies ? (
            <>
              <View style={styles.loyaltyRow}>
                <Text style={styles.loyaltyHeadline}>
                  🎉 Cliente frecuente — le toca su premio
                </Text>
              </View>
              <Text style={styles.loyaltyDetail}>
                {loyaltyStatus.reward_product_name}
                {loyaltyStatus.discount_percent >= 100 ? ' gratis' : ` con ${loyaltyStatus.discount_percent}% off`}
              </Text>
              {loyaltyApplied ? (
                loyaltyDiscount > 0 ? (
                  <Text style={styles.loyaltyApplied}>
                    Premio aplicado: −${loyaltyDiscount.toFixed(2)}
                  </Text>
                ) : (
                  <Text style={styles.loyaltyWarning}>
                    Agrega "{loyaltyStatus.reward_product_name}" al ticket para aplicar el premio.
                  </Text>
                )
              ) : (
                <Pressable style={styles.loyaltyButton} onPress={() => setLoyaltyApplied(true)}>
                  <Text style={styles.loyaltyButtonText}>Aplicar premio</Text>
                </Pressable>
              )}
            </>
          ) : (
            <Text style={styles.loyaltyProgress}>
              Cliente frecuente: {loyaltyStatus.visits_count}/{loyaltyStatus.visits_required} visitas
            </Text>
          )}
        </View>
      )}

      <Pressable style={styles.discountRow} onPress={() => setShowDiscount(true)}>
        <Ionicons name="pricetag-outline" size={16}
          color={discount > 0 ? '#0F6E56' : '#666'} />
        <Text style={[styles.discountText, discount > 0 && { color: '#0F6E56' }]}>
          {discount > 0
            ? `Descuento aplicado: $${discount.toFixed(2)}`
            : 'Aplicar descuento'}
        </Text>
        {discount > 0 && (
          <Pressable hitSlop={10} onPress={() => setDiscount(0)}>
            <Text style={styles.discountRemove}>Quitar</Text>
          </Pressable>
        )}
      </Pressable>

      <Text style={styles.sectionTitle}>Nombre del cliente (opcional)</Text>
      <TextInput placeholderTextColor="#9A9A9A"
        style={styles.input}
        placeholder="Para llamarlo cuando su orden esté lista"
        value={cart.customerName}
        onChangeText={cart.setCustomerName}
        autoCapitalize="words"
        returnKeyType="done"
      />

      {tier === 'pro' && (
        <>
          <Text style={styles.sectionTitle}>Teléfono (opcional · clientes frecuentes)</Text>
          <TextInput placeholderTextColor="#9A9A9A"
            style={styles.input}
            placeholder="Para el programa de clientes frecuentes"
            value={customerPhone}
            onChangeText={(v) => { setCustomerPhone(v); setLoyaltyApplied(false); }}
            keyboardType="phone-pad"
            returnKeyType="done"
          />
          {checkingLoyalty && (
            <Text style={styles.checkingText}>Verificando cliente…</Text>
          )}
        </>
      )}

      <Text style={styles.sectionTitle}>Tipo de orden</Text>
      <View style={styles.methodRow}>
        {([['llevar', 'Para llevar'], ['local', 'En local']] as const).map(([t, label]) => (
          <Pressable
            key={t}
            style={[styles.methodButton, cart.orderType === t && styles.methodSelected]}
            onPress={() => cart.setOrderType(t)}
          >
            <Text style={[styles.methodText,
              cart.orderType === t && styles.methodTextSelected]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.sectionTitle}>¿Cómo pagó el cliente?</Text>
      <View style={styles.methodRow}>
        {(['efectivo', 'tarjeta', 'transferencia', 'plataforma'] as PaymentMethod[]).map((m) => (
          <Pressable
            key={m}
            style={[styles.methodButton, method === m && styles.methodSelected]}
            onPress={() => setMethod(m)}
          >
            <Text style={[styles.methodText, method === m && styles.methodTextSelected]}>
              {m === 'efectivo' ? 'Efectivo' : m === 'tarjeta' ? 'Tarjeta'
                : m === 'transferencia' ? 'Transf.' : 'Plataforma'}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Propina (opcional)</Text>
      <View style={styles.methodRow}>
        {[0, 5, 10, 15].map((pct) => {
          const value = pct === 0 ? 0 : +(total * (pct / 100)).toFixed(2);
          const selected = tip === value && customTip === '';
          return (
            <Pressable key={pct}
              style={[styles.methodButton, selected && styles.methodSelected]}
              onPress={() => { setTip(value); setCustomTip(''); }}>
              <Text style={[styles.methodText, selected && styles.methodTextSelected]}>
                {pct === 0 ? 'Sin propina' : `${pct}%`}
              </Text>
              {pct > 0 && (
                <Text style={styles.tipSub}>${value.toFixed(0)}</Text>
              )}
            </Pressable>
          );
        })}
      </View>
      <TextInput placeholderTextColor="#9A9A9A"
        style={styles.input}
        placeholder="Otra cantidad de propina"
        keyboardType="decimal-pad"
        value={customTip}
        onChangeText={(v) => {
          setCustomTip(v);
          setTip(Math.max(parseFloat(v) || 0, 0));
        }}
      />

      {method === 'tarjeta' && (
        <>
          <Text style={styles.sectionTitle}>Tipo de tarjeta</Text>
          <View style={styles.methodRow}>
            {(['debito', 'credito'] as CardType[]).map((c) => (
              <Pressable
                key={c}
                style={[styles.methodButton, cardType === c && styles.methodSelected]}
                onPress={() => setCardType(c)}
              >
                <Text style={[styles.methodText, cardType === c && styles.methodTextSelected]}>
                  {c === 'debito' ? 'Débito' : 'Crédito'}
                </Text>
              </Pressable>
            ))}
          </View>
          <TextInput placeholderTextColor="#9A9A9A"
            style={styles.input}
            placeholder="Referencia del voucher (opcional)"
            value={reference}
            onChangeText={setReference}
          />
          <Text style={styles.hint}>
            Cobra en la terminal física y confirma aquí una vez aprobado.
          </Text>
        </>
      )}

      {method === 'plataforma' && (
        <>
          <Text style={styles.sectionTitle}>¿Cuál plataforma?</Text>
          <View style={styles.methodRow}>
            {['Uber Eats', 'Didi Food', 'Rappi'].map((p) => (
              <Pressable key={p}
                style={[styles.methodButton, reference === p && styles.methodSelected]}
                onPress={() => setReference(p)}>
                <Text style={[styles.methodText, reference === p && styles.methodTextSelected]}>
                  {p}
                </Text>
              </Pressable>
            ))}
          </View>
          <TextInput placeholderTextColor="#9A9A9A"
            style={styles.input}
            placeholder="...o escribe otra plataforma"
            value={reference}
            onChangeText={setReference}
          />
          <Text style={styles.hint}>
            El pago ya lo procesó la plataforma; no se contará como efectivo
            en el corte de caja.
          </Text>
        </>
      )}

      {method === 'efectivo' && (
        <>
          <Text style={styles.sectionTitle}>Recibido</Text>
          <View style={styles.methodRow}>
            {amounts.map((a) => (
              <Pressable
                key={a}
                style={[styles.methodButton, received === a && styles.methodSelected]}
                onPress={() => setReceived(a)}
              >
                <Text style={[styles.methodText, received === a && styles.methodTextSelected]}>
                  ${a}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.methodRow}>
            <Pressable
              style={[styles.methodButton, received === total && styles.methodSelected]}
              onPress={() => setReceived(total)}
            >
              <Text style={[styles.methodText, received === total && styles.methodTextSelected]}>
                Exacto
              </Text>
            </Pressable>
            <TextInput placeholderTextColor="#9A9A9A"
              style={[styles.input, { flex: 1, marginTop: 0 }]}
              placeholder="Otro monto"
              keyboardType="decimal-pad"
              onChangeText={(t) => setReceived(t ? parseFloat(t) : null)}
            />
          </View>
          {change !== null && change >= 0 && (
            <View style={styles.changeBox}>
              <Text style={styles.changeLabel}>Cambio a entregar</Text>
              <Text style={styles.changeValue}>${change.toFixed(2)}</Text>
            </View>
          )}
        </>
      )}

      <Pressable
        style={[styles.confirmButton, !canConfirm && { opacity: 0.5 }]}
        disabled={!canConfirm}
        onPress={confirm}
      >
        <Text style={styles.confirmText}>
          {busy ? 'Registrando…' : `Confirmar pago · $${grandTotal.toFixed(2)}`}
        </Text>
      </Pressable>
      <Text style={styles.hint}>La orden pasará a la cola de preparación al confirmar.</Text>

      <Modal visible={showDiscount} transparent animationType="slide"
        onRequestClose={() => setShowDiscount(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1, justifyContent: 'flex-end' }}
        >
          <Pressable style={styles.backdrop} onPress={() => setShowDiscount(false)} />
          <View style={styles.discountSheet}>
            <Text style={styles.discountTitle}>Aplicar descuento</Text>
            <Text style={styles.discountSub}>
              Sobre ${gross.toFixed(2)}
              {employee?.role === 'cajero' ? ' · tu rol permite hasta 10%' : ''}
            </Text>
            <View style={styles.discountChips}>
              {[5, 10, 15, 20].map((pct) => (
                <Pressable key={pct} style={styles.discountChip}
                  onPress={() => applyDiscount(gross * (pct / 100))}>
                  <Text style={styles.discountChipText}>{pct}%</Text>
                  <Text style={styles.discountChipSub}>
                    −${(gross * (pct / 100)).toFixed(0)}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput placeholderTextColor="#9A9A9A"
                style={[styles.input, { flex: 1, marginTop: 0 }]}
                placeholder="Monto fijo, ej. 25"
                keyboardType="decimal-pad"
                value={customDiscount}
                onChangeText={setCustomDiscount}
              />
              <Pressable
                style={[styles.discountApply, !parseFloat(customDiscount) && { opacity: 0.5 }]}
                disabled={!parseFloat(customDiscount)}
                onPress={() => applyDiscount(parseFloat(customDiscount) || 0)}>
                <Text style={styles.discountApplyText}>Aplicar</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
    </KeyboardAvoidingView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 10 },
  containerWide: { maxWidth: 560, width: '100%', alignSelf: 'center' },
  totalBox: {
    backgroundColor: '#4A1B0C', borderRadius: 14, padding: 18, alignItems: 'center',
  },
  totalLabel: { color: '#F5C4B3', fontSize: 12 },
  totalValue: { color: '#FAECE7', fontSize: 32, fontWeight: '600' },
  totalSub: { color: '#F0997B', fontSize: 11, marginTop: 2 },
  saleSummary: {
    borderWidth: 1, borderColor: '#eee', borderRadius: 12,
    padding: 12, gap: 8, backgroundColor: '#fff',
  },
  saleSummaryHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  saleSummaryTitle: { fontSize: 13, fontWeight: '700', color: '#333' },
  saleSummaryCount: { fontSize: 11, color: '#888' },
  saleLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  saleLineInfo: { flex: 1 },
  saleLineName: { fontSize: 13, color: '#333' },
  saleLineModifiers: { fontSize: 11, color: '#888', marginTop: 2 },
  saleLineTotal: { fontSize: 13, fontWeight: '600', color: '#333' },
  promoBox: {
    backgroundColor: '#E1F5EE', borderRadius: 10, padding: 10, gap: 4,
  },
  promoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  promoText: { flex: 1, fontSize: 12.5, color: '#0F6E56', fontWeight: '600' },
  promoAmount: { fontSize: 12.5, color: '#0F6E56', fontWeight: '700' },
  loyaltyBox: {
    backgroundColor: '#FDF0DC', borderRadius: 10, padding: 12, gap: 6,
  },
  loyaltyRow: { flexDirection: 'row', alignItems: 'center' },
  loyaltyHeadline: { fontSize: 13.5, color: '#854F0B', fontWeight: '700' },
  loyaltyDetail: { fontSize: 12.5, color: '#854F0B' },
  loyaltyApplied: { fontSize: 12.5, color: '#0F6E56', fontWeight: '700' },
  loyaltyWarning: { fontSize: 12, color: '#A32D2D' },
  loyaltyProgress: { fontSize: 12.5, color: '#854F0B' },
  loyaltyButton: {
    backgroundColor: '#4A1B0C', borderRadius: 8, paddingVertical: 9,
    alignItems: 'center', marginTop: 2,
  },
  loyaltyButtonText: { color: '#FAECE7', fontSize: 13, fontWeight: '600' },
  checkingText: { fontSize: 11.5, color: '#999', fontStyle: 'italic' },
  sectionTitle: { fontSize: 13, color: '#666', marginTop: 8 },
  methodRow: { flexDirection: 'row', gap: 8 },
  methodButton: {
    flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
    paddingVertical: 12, alignItems: 'center',
  },
  methodSelected: { borderColor: '#4A1B0C', borderWidth: 2, backgroundColor: '#FAECE7' },
  methodText: { fontSize: 14, color: '#444' },
  methodTextSelected: { color: '#4A1B0C', fontWeight: '600' },
  input: {
    color: '#1F1F1F',
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginTop: 4,
  },
  changeBox: {
    backgroundColor: '#E1F5EE', borderRadius: 12, padding: 14,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  changeLabel: { color: '#0F6E56', fontSize: 13 },
  changeValue: { color: '#04342C', fontSize: 24, fontWeight: '600' },
  confirmButton: {
    backgroundColor: '#4A1B0C', borderRadius: 10,
    paddingVertical: 15, alignItems: 'center', marginTop: 8,
  },
  confirmText: { color: '#FAECE7', fontSize: 15, fontWeight: '600' },
  hint: { fontSize: 11, color: '#888', textAlign: 'center' },
  tipSub: { fontSize: 10, color: '#999', marginTop: 1 },
  discountRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: '#e5e5e5', borderRadius: 10,
    paddingVertical: 10, paddingHorizontal: 12,
  },
  discountText: { flex: 1, fontSize: 13, color: '#666', fontWeight: '600' },
  discountRemove: { fontSize: 12, color: '#A32D2D', fontWeight: '600' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  discountSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 32, gap: 10,
  },
  discountTitle: { fontSize: 17, fontWeight: '700' },
  discountSub: { fontSize: 12, color: '#888' },
  discountChips: { flexDirection: 'row', gap: 8 },
  discountChip: {
    flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
    paddingVertical: 10, alignItems: 'center',
  },
  discountChipText: { fontSize: 15, fontWeight: '700', color: '#4A1B0C' },
  discountChipSub: { fontSize: 10, color: '#999', marginTop: 1 },
  discountApply: {
    backgroundColor: '#4A1B0C', borderRadius: 10,
    paddingHorizontal: 18, justifyContent: 'center',
  },
  discountApplyText: { color: '#FAECE7', fontWeight: '600', fontSize: 13 },
});

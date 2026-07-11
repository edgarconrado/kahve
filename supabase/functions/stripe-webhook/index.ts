// Edge Function: stripe-webhook
// Recibe eventos de Stripe y actualiza el plan de la organización.
// Desplegar con: npx supabase functions deploy stripe-webhook --no-verify-jwt
//
// Secretos requeridos (npx supabase secrets set ...):
//   STRIPE_SECRET_KEY     = sk_test_... (o sk_live_...)
//   STRIPE_WEBHOOK_SECRET = whsec_...   (del endpoint en el dashboard)
//
// El Payment Link DEBE compartirse con ?client_reference_id=<slug>
// para saber a qué organización activar. Ejemplo:
//   https://buy.stripe.com/test_xxx?client_reference_id=cafe-la-borra

import Stripe from 'npm:stripe@17';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!);

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

Deno.serve(async (req) => {
  const signature = req.headers.get('stripe-signature');
  const body = await req.text();

  // Verificar que el evento realmente viene de Stripe
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature!,
      Deno.env.get('STRIPE_WEBHOOK_SECRET')!,
    );
  } catch (err) {
    console.error('Firma inválida:', err);
    return new Response('Firma inválida', { status: 400 });
  }

  switch (event.type) {
    // Pago inicial completado: activar Pro
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const slug = session.client_reference_id;
      if (!slug) {
        console.error('checkout sin client_reference_id; no sé a quién activar.',
          'Email del pagador:', session.customer_details?.email);
        break; // 200 para que Stripe no reintente; revisar logs manualmente
      }
      const { data, error } = await admin
        .from('organizations')
        .update({
          plan: 'pro',
          stripe_customer_id: session.customer as string,
          stripe_subscription_id: session.subscription as string,
        })
        .eq('slug', slug)
        .select('name')
        .single();
      if (error || !data) {
        console.error(`No encontré la organización '${slug}':`, error?.message);
      } else {
        console.log(`✅ Pro activado para ${data.name} (${slug})`);
      }
      break;
    }

    // Cambios de estado de la suscripción (renovaciones fallidas agotadas, etc.)
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      // past_due se ignora: los reintentos de Stripe siguen trabajando
      if (['canceled', 'unpaid', 'incomplete_expired'].includes(sub.status)) {
        await downgrade(sub.id);
      } else if (['active', 'trialing'].includes(sub.status)) {
        await admin.from('organizations')
          .update({ plan: 'pro' })
          .eq('stripe_subscription_id', sub.id);
      }
      break;
    }

    // Suscripción cancelada definitivamente: regresar a gratis
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      await downgrade(sub.id);
      break;
    }

    default:
      // Otros eventos: aceptar y no hacer nada
      break;
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});

async function downgrade(subscriptionId: string) {
  const { data } = await admin
    .from('organizations')
    .update({ plan: 'free' })
    .eq('stripe_subscription_id', subscriptionId)
    .select('name, slug')
    .single();
  if (data) console.log(`⬇️ ${data.name} (${data.slug}) regresó a plan gratis`);
}

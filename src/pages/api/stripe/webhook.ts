import type { APIRoute } from 'astro';
import Stripe from 'stripe';
import { sendEmail } from '../email/send';

export const prerender = false;

const stripe = new Stripe(import.meta.env.STRIPE_SECRET_KEY ?? process.env.STRIPE_SECRET_KEY ?? '');

export const POST: APIRoute = async ({ request }) => {
  const sig = request.headers.get('stripe-signature');
  const webhookSecret = import.meta.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    return new Response('Missing signature', { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const body = await request.text();
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  switch (event.type) {
    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice;
      // Notify Travis that payment was received
      await sendEmail({
        to: 'travis@fully-operational.com',
        subject: `Payment received — ${invoice.customer_email}`,
        html: `
          <p>Payment received from <strong>${invoice.customer_email}</strong>.</p>
          <p>Amount: <strong>$${((invoice.amount_paid ?? 0) / 100).toFixed(2)}</strong></p>
          <p><a href="${invoice.hosted_invoice_url}">View invoice →</a></p>
        `,
      });
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      if (!invoice.customer_email) break;
      // Send follow-up to client
      await sendEmail({
        to: invoice.customer_email,
        subject: 'Your invoice from Travis Smith — payment issue',
        html: `
          <p>Hi there,</p>
          <p>It looks like there was an issue processing your payment for the invoice below.</p>
          <p><a href="${invoice.hosted_invoice_url}">View and pay invoice →</a></p>
          <p>If you have any questions, just reply to this email.</p>
          <p>— Travis</p>
        `,
      });
      break;
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
      const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
      // Notify Travis
      await sendEmail({
        to: 'travis@fully-operational.com',
        subject: `Subscription updated — ${customer.email}`,
        html: `<p>Subscription for <strong>${customer.email}</strong> updated to status: <strong>${sub.status}</strong>.</p>`,
      });
      break;
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

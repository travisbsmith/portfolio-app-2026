import type { APIRoute } from 'astro';
import Stripe from 'stripe';
import { updateLead } from '../../../lib/leads';

export const prerender = false;

const stripe = new Stripe(import.meta.env.STRIPE_SECRET_KEY ?? process.env.STRIPE_SECRET_KEY ?? '');

export const POST: APIRoute = async ({ request }) => {
  try {
    const { leadId, clientEmail, clientName, service, amount, lineItems } = await request.json() as {
      leadId?: string;
      clientEmail: string;
      clientName: string;
      service?: string;
      amount?: number;
      lineItems?: { description: string; amount: number }[];
    };

    if (!clientEmail || !clientName) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const hasLineItems = Array.isArray(lineItems) && lineItems.length > 0;
    if (!hasLineItems && !amount) {
      return new Response(JSON.stringify({ error: 'amount or lineItems required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Find or create Stripe customer
    const existing = await stripe.customers.list({ email: clientEmail, limit: 1 });
    const customer = existing.data.length > 0
      ? existing.data[0]
      : await stripe.customers.create({ email: clientEmail, name: clientName });

    // Save customer ID back to lead so the invoice sidebar loads correctly
    if (leadId) {
      await updateLead(leadId, { stripeCustomerId: customer.id });
    }

    // Create invoice items — either from lineItems array or single amount
    if (hasLineItems) {
      for (const item of lineItems!) {
        await stripe.invoiceItems.create({
          customer: customer.id,
          amount: Math.round(item.amount * 100),
          currency: 'usd',
          description: item.description,
        });
      }
    } else {
      await stripe.invoiceItems.create({
        customer: customer.id,
        amount: Math.round(amount! * 100),
        currency: 'usd',
        description: service ?? 'Services',
      });
    }

    // Create and finalize invoice
    const invoice = await stripe.invoices.create({
      customer: customer.id,
      collection_method: 'send_invoice',
      days_until_due: 7,
      metadata: { service: service ?? '' },
    });

    const finalized = await stripe.invoices.finalizeInvoice(invoice.id);
    await stripe.invoices.sendInvoice(finalized.id);

    return new Response(JSON.stringify({
      invoiceId: finalized.id,
      hostedUrl: finalized.hosted_invoice_url,
      status: finalized.status,
      customerId: customer.id,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('Invoice creation error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

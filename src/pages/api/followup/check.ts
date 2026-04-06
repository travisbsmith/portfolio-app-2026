import type { APIRoute } from 'astro';
import Stripe from 'stripe';
import { sendEmail } from '../email/send';

async function writeKvCache(key: string, value: unknown): Promise<void> {
  const token = process.env.KV_REST_API_TOKEN;
  const base = process.env.KV_REST_API_URL;
  if (!token || !base) return;
  await fetch(`${base}/set/${key}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(JSON.stringify(value)),
  });
}

export const prerender = false;

// Called daily by Vercel cron (vercel.json) at 8 AM CT
// Also secured with CRON_SECRET so it can't be triggered externally
export const GET: APIRoute = async ({ request }) => {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${import.meta.env.CRON_SECRET ?? process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const stripe = new Stripe(import.meta.env.STRIPE_SECRET_KEY ?? process.env.STRIPE_SECRET_KEY ?? '');
  const results: string[] = [];

  // --- Check for invoices open > 3 days ---
  const threeDaysAgo = Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 3;
  const openInvoices = await stripe.invoices.list({
    status: 'open',
    created: { lte: threeDaysAgo },
    limit: 20,
  });

  for (const invoice of openInvoices.data) {
    if (!invoice.customer_email) continue;

    // Only send one follow-up (check metadata flag)
    if (invoice.metadata?.followup_sent) continue;

    await sendEmail({
      to: invoice.customer_email,
      subject: 'Quick reminder — invoice from Travis Smith',
      html: `
        <p>Hi there,</p>
        <p>Just a friendly reminder that your invoice is still open.</p>
        <p><a href="${invoice.hosted_invoice_url}">View and pay invoice →</a></p>
        <p>If you have any questions or need a different payment arrangement, just reply here.</p>
        <p>— Travis</p>
      `,
    });

    // Mark invoice so we don't send again
    await stripe.invoices.update(invoice.id, {
      metadata: { ...invoice.metadata, followup_sent: 'true' },
    });

    results.push(`Followed up: ${invoice.customer_email}`);
  }

  // --- Check for upcoming subscription renewals (5 days out) ---
  const fiveDaysFromNow = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 5;
  const subscriptions = await stripe.subscriptions.list({
    status: 'active',
    limit: 20,
  });

  for (const sub of subscriptions.data) {
    const renewsAt = sub.current_period_end;
    if (renewsAt > fiveDaysFromNow) continue;

    // Only send one heads-up per renewal cycle
    if (sub.metadata?.renewal_notice_sent === String(renewsAt)) continue;

    const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
    const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
    if (!customer.email) continue;

    const renewDate = new Date(renewsAt * 1000).toLocaleDateString('en-US', {
      month: 'long', day: 'numeric',
    });
    const amount = (sub.items.data[0]?.price.unit_amount ?? 0) / 100;

    await sendEmail({
      to: customer.email,
      subject: `Your Insider Retainer renews ${renewDate}`,
      html: `
        <p>Hi there,</p>
        <p>Just a heads-up — your monthly retainer ($${amount.toFixed(2)}) will renew on <strong>${renewDate}</strong>.</p>
        <p>No action needed. If you'd like to make any changes, just reply to this email before then.</p>
        <p>Looking forward to another great month.</p>
        <p>— Travis</p>
      `,
    });

    await stripe.subscriptions.update(sub.id, {
      metadata: { ...sub.metadata, renewal_notice_sent: String(renewsAt) },
    });

    results.push(`Renewal notice sent: ${customer.email}`);
  }

  // Write overdue invoice count/amount to KV so dashboard can read it cheaply
  try {
    const allOpen = await stripe.invoices.list({ status: 'open', limit: 100 });
    const overdue = allOpen.data.filter(inv => {
      const dueDate = inv.due_date ?? inv.created + 60 * 60 * 24 * 7;
      return dueDate < Math.floor(Date.now() / 1000);
    });
    const overdueAmount = overdue.reduce((s, inv) => s + (inv.amount_due ?? 0) / 100, 0);
    await writeKvCache('overdue-cache', {
      count: overdue.length,
      amount: overdueAmount,
      updatedAt: new Date().toISOString(),
    });
  } catch { /* non-fatal */ }

  return new Response(JSON.stringify({ ok: true, results }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

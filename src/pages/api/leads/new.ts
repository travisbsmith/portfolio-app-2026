import type { APIRoute } from 'astro';
import { saveLead, type Lead } from '../../../lib/leads';
import { sendEmail } from '../email/send';

export const prerender = false;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Handle CORS preflight
export const OPTIONS: APIRoute = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function getWantsJson(request: Request, body: Record<string, string>, hasSecret: boolean) {
  return hasSecret || body._via === 'fetch' || (request.headers.get('accept') ?? '').includes('application/json');
}

export const POST: APIRoute = async ({ request, url, redirect }) => {
  // Parse body — handles both direct form POST and JSON webhook
  const contentType = request.headers.get('content-type') ?? '';
  let body: Record<string, string>;
  try {
    if (contentType.includes('application/json')) {
      body = await request.json();
    } else {
      const fd = await request.formData();
      body = Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)]));
    }
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  const secret = url.searchParams.get('secret');
  const wantsJson = getWantsJson(request, body, Boolean(secret));

  // Honeypot — silently redirect spambots
  if (body._gotcha) {
    return wantsJson ? jsonResponse({ ok: true, ignored: true }) : redirect('https://fully-operational.com/booked');
  }

  // Webhook calls include ?secret — verify it
  if (secret) {
    const expected = import.meta.env.CRON_SECRET ?? process.env.CRON_SECRET;
    if (!expected || secret !== expected) {
      return wantsJson ? jsonResponse({ ok: false, error: 'Unauthorized' }, 401) : new Response('Unauthorized', { status: 401 });
    }
  }

  const name = (body.name ?? '').trim();
  const email = (body.email ?? '').trim().toLowerCase();
  const storeStatus = (body.store_status ?? '').trim();
  const challenge = (body.challenge ?? '').trim();
  const serviceInterest = (body.service_interest ?? '').trim();

  const validationErrors: string[] = [];
  if (!name) validationErrors.push('Name is required.');
  if (!email) validationErrors.push('Email is required.');
  if (email && !EMAIL_RE.test(email)) validationErrors.push('Email must be valid.');
  if (!storeStatus) validationErrors.push('Store status is required.');
  if (!challenge) validationErrors.push('Challenge is required.');
  if (!serviceInterest) validationErrors.push('Service interest is required.');

  if (validationErrors.length > 0) {
    return wantsJson
      ? jsonResponse({ ok: false, error: 'Validation failed', details: validationErrors }, 400)
      : new Response(validationErrors.join(' '), { status: 400 });
  }

  const now = new Date().toISOString();
  const lead: Lead = {
    id: `lead_${Date.now()}`,
    name,
    email,
    storeUrl: body.store_url ?? '',
    storeStatus,
    challenge,
    serviceInterest,
    availability: body.availability ?? '',
    timezone: body.timezone ?? '',
    referral: body.referral ?? '',
    additionalNotes: body.notes ?? '',
    launchDate: body.launch_date ?? '',
    hasVisualDesigner: body.has_visual_designer ?? '',
    stage: 'Lead',
    internalNotes: '',
    stripeCustomerId: '',
    unsubscribeToken: Math.random().toString(36).slice(2) + Date.now().toString(36),
    createdAt: now,
    updatedAt: now,
  };

  // Save to KV — non-fatal if KV not configured yet
  try {
    await saveLead(lead);
  } catch (e) {
    console.error('KV save failed:', { leadId: lead.id, error: e });
  }

  // Email Travis a notification
  try {
    const emailResult = await sendEmail({
      to: 'travis@fully-operational.com',
      subject: `New booking request from ${lead.name}`,
      html: `
        <h2>New booking request</h2>
        <table style="border-collapse:collapse;width:100%;font-family:monospace;font-size:14px">
          <tr><td style="padding:6px 12px;color:#666;white-space:nowrap">Name</td><td style="padding:6px 12px">${lead.name}</td></tr>
          <tr><td style="padding:6px 12px;color:#666;white-space:nowrap">Email</td><td style="padding:6px 12px"><a href="mailto:${lead.email}">${lead.email}</a></td></tr>
          <tr><td style="padding:6px 12px;color:#666;white-space:nowrap">Store URL</td><td style="padding:6px 12px">${lead.storeUrl || '—'}</td></tr>
          <tr><td style="padding:6px 12px;color:#666;white-space:nowrap">Store Status</td><td style="padding:6px 12px">${lead.storeStatus || '—'}</td></tr>
          <tr><td style="padding:6px 12px;color:#666;white-space:nowrap">Interested In</td><td style="padding:6px 12px">${lead.serviceInterest || '—'}</td></tr>
          <tr><td style="padding:6px 12px;color:#666;white-space:nowrap">Challenge</td><td style="padding:6px 12px;white-space:pre-wrap">${lead.challenge || '—'}</td></tr>
          <tr><td style="padding:6px 12px;color:#666;white-space:nowrap">Referral</td><td style="padding:6px 12px">${lead.referral || '—'}</td></tr>
        </table>
        <p style="margin-top:24px"><a href="https://app.fully-operational.com/dashboard" style="background:#ff5722;color:white;padding:10px 20px;text-decoration:none;font-family:monospace">View in Dashboard →</a></p>
      `,
    });

    if (emailResult.error) {
      console.error('Failed to send lead notification email:', {
        leadId: lead.id,
        email: lead.email,
        error: emailResult.error,
      });
      return wantsJson
        ? jsonResponse({ ok: false, error: 'Lead saved but email delivery failed', id: lead.id }, 502)
        : new Response('Lead saved but email delivery failed', { status: 502 });
    }

    console.info('Lead notification email sent', {
      leadId: lead.id,
      emailId: emailResult.id,
      recipient: 'travis@fully-operational.com',
    });
  } catch (e) {
    console.error('Failed to send lead notification email:', {
      leadId: lead.id,
      email: lead.email,
      error: e,
    });
    return wantsJson
      ? jsonResponse({ ok: false, error: 'Lead saved but email delivery failed', id: lead.id }, 502)
      : new Response('Lead saved but email delivery failed', { status: 502 });
  }

  // Webhook or fetch call → return JSON; direct form post → redirect
  if (wantsJson) {
    return jsonResponse({ ok: true, id: lead.id, name: lead.name, email: lead.email, emailSent: true });
  }

  return redirect('https://fully-operational.com/booked');
};

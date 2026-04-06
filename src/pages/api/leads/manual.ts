import type { APIRoute } from 'astro';
import { saveLead, type Lead, type LeadStage } from '../../../lib/leads';
import { SESSION_COOKIE, SESSION_VALUE } from '../../../lib/auth';

export const prerender = false;

const VALID_STAGES: LeadStage[] = ['Lead', 'Call Scheduled', 'Proposal Sent', 'Active', 'Closed'];

export const POST: APIRoute = async ({ request, cookies }) => {
  const session = cookies.get(SESSION_COOKIE)?.value;
  if (session !== SESSION_VALUE) return new Response('Unauthorized', { status: 401 });

  let body: Record<string, string>;
  try {
    body = await request.json();
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  const name = body.name?.trim() ?? '';
  const email = body.email?.trim() ?? '';
  if (!name || !email) {
    return new Response(JSON.stringify({ error: 'Name and email are required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const stage: LeadStage = VALID_STAGES.includes(body.stage as LeadStage)
    ? (body.stage as LeadStage)
    : 'Lead';

  const now = new Date().toISOString();
  const lead: Lead = {
    id: `lead_${Date.now()}`,
    name,
    email,
    storeUrl: body.storeUrl?.trim() ?? '',
    storeStatus: '',
    challenge: body.notes?.trim() ?? '',
    serviceInterest: body.serviceInterest ?? '',
    availability: '',
    timezone: '',
    referral: body.referral?.trim() ?? '',
    additionalNotes: '',
    launchDate: '',
    hasVisualDesigner: '',
    stage,
    internalNotes: '',
    stripeCustomerId: '',
    createdAt: now,
    updatedAt: now,
  };

  await saveLead(lead);

  return new Response(JSON.stringify({ ok: true, id: lead.id }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

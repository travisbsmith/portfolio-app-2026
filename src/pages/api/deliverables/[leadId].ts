import type { APIRoute } from 'astro';
import { getLeads, updateLead, type Deliverable } from '../../../lib/leads';
import { SESSION_COOKIE, SESSION_VALUE } from '../../../lib/auth';

export const prerender = false;

function isAuthed(cookies: Parameters<APIRoute>[0]['cookies']): boolean {
  return cookies.get(SESSION_COOKIE)?.value === SESSION_VALUE;
}

export const POST: APIRoute = async ({ params, cookies, request }) => {
  if (!isAuthed(cookies)) return new Response('Unauthorized', { status: 401 });

  let body: { title: string };
  try { body = await request.json(); } catch {
    return new Response('Bad request', { status: 400 });
  }

  if (!body.title) {
    return new Response(JSON.stringify({ error: 'title required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const leads = await getLeads();
  const lead = leads.find(l => l.id === params.leadId);
  if (!lead) return new Response('Not found', { status: 404 });

  const item: Deliverable = {
    id: 'del_' + Date.now(),
    title: body.title,
    status: 'pending',
  };

  await updateLead(params.leadId!, {
    deliverables: [...(lead.deliverables ?? []), item],
  });

  return new Response(JSON.stringify(item), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const PATCH: APIRoute = async ({ params, cookies, request }) => {
  if (!isAuthed(cookies)) return new Response('Unauthorized', { status: 401 });

  let body: { itemId: string; status: Deliverable['status'] };
  try { body = await request.json(); } catch {
    return new Response('Bad request', { status: 400 });
  }

  const leads = await getLeads();
  const lead = leads.find(l => l.id === params.leadId);
  if (!lead) return new Response('Not found', { status: 404 });

  const updated = (lead.deliverables ?? []).map(d =>
    d.id === body.itemId ? { ...d, status: body.status } : d
  );

  await updateLead(params.leadId!, { deliverables: updated });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const DELETE: APIRoute = async ({ params, cookies, request }) => {
  if (!isAuthed(cookies)) return new Response('Unauthorized', { status: 401 });

  let body: { itemId: string };
  try { body = await request.json(); } catch {
    return new Response('Bad request', { status: 400 });
  }

  const leads = await getLeads();
  const lead = leads.find(l => l.id === params.leadId);
  if (!lead) return new Response('Not found', { status: 404 });

  await updateLead(params.leadId!, {
    deliverables: (lead.deliverables ?? []).filter(d => d.id !== body.itemId),
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

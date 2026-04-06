import type { APIRoute } from 'astro';
import { getLeads, updateLead, type ActivityEntry } from '../../../lib/leads';
import { SESSION_COOKIE, SESSION_VALUE } from '../../../lib/auth';

export const prerender = false;

function isAuthed(cookies: Parameters<APIRoute>[0]['cookies']): boolean {
  return cookies.get(SESSION_COOKIE)?.value === SESSION_VALUE;
}

export const POST: APIRoute = async ({ params, cookies, request }) => {
  if (!isAuthed(cookies)) return new Response('Unauthorized', { status: 401 });

  let body: { type: string; text: string };
  try { body = await request.json(); } catch {
    return new Response('Bad request', { status: 400 });
  }

  if (!body.text || !body.type) {
    return new Response(JSON.stringify({ error: 'type and text required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const leads = await getLeads();
  const lead = leads.find(l => l.id === params.leadId);
  if (!lead) return new Response('Not found', { status: 404 });

  const entry: ActivityEntry = {
    id: 'act_' + Date.now(),
    type: body.type as 'Note' | 'Call' | 'Email',
    text: body.text,
    createdAt: new Date().toISOString(),
  };

  await updateLead(params.leadId!, {
    activityLog: [entry, ...(lead.activityLog ?? [])],
  });

  return new Response(JSON.stringify(entry), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const DELETE: APIRoute = async ({ params, cookies, request }) => {
  if (!isAuthed(cookies)) return new Response('Unauthorized', { status: 401 });

  let body: { entryId: string };
  try { body = await request.json(); } catch {
    return new Response('Bad request', { status: 400 });
  }

  const leads = await getLeads();
  const lead = leads.find(l => l.id === params.leadId);
  if (!lead) return new Response('Not found', { status: 404 });

  await updateLead(params.leadId!, {
    activityLog: (lead.activityLog ?? []).filter(e => e.id !== body.entryId),
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

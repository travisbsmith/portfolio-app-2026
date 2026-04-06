import type { APIRoute } from 'astro';
import { getTimeEntries, addTimeEntry, deleteTimeEntry, type TimeEntry } from '../../../lib/time';
import { SESSION_COOKIE, SESSION_VALUE } from '../../../lib/auth';

export const prerender = false;

function isAuthed(cookies: Parameters<APIRoute>[0]['cookies']): boolean {
  return cookies.get(SESSION_COOKIE)?.value === SESSION_VALUE;
}

export const GET: APIRoute = async ({ params, cookies }) => {
  if (!isAuthed(cookies)) return new Response('Unauthorized', { status: 401 });
  const entries = await getTimeEntries(params.leadId!);
  return new Response(JSON.stringify(entries), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const POST: APIRoute = async ({ params, cookies, request }) => {
  if (!isAuthed(cookies)) return new Response('Unauthorized', { status: 401 });

  let body: Partial<TimeEntry>;
  try { body = await request.json(); } catch {
    return new Response('Bad request', { status: 400 });
  }

  if (!body.hours || !body.date) {
    return new Response(JSON.stringify({ error: 'hours and date required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const entry: TimeEntry = {
    id: `t_${Date.now()}`,
    leadId: params.leadId!,
    date: body.date,
    hours: Number(body.hours),
    description: body.description ?? '',
    createdAt: new Date().toISOString(),
  };

  await addTimeEntry(entry);
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

  await deleteTimeEntry(params.leadId!, body.entryId);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

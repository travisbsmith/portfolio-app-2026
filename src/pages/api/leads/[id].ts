import type { APIRoute } from 'astro';
import { updateLead, deleteLead } from '../../../lib/leads';
import { SESSION_COOKIE, SESSION_VALUE } from '../../../lib/auth';

export const prerender = false;

// PATCH /api/leads/:id — update stage, internalNotes, stripeCustomerId
// Called from dashboard JS; secured via session cookie
export const PATCH: APIRoute = async ({ request, params, cookies }) => {
  const session = cookies.get(SESSION_COOKIE)?.value;
  if (session !== SESSION_VALUE) {
    return new Response('Unauthorized', { status: 401 });
  }

  const id = params.id;
  if (!id) return new Response('Missing id', { status: 400 });

  let patch: Record<string, string>;
  try {
    patch = await request.json();
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  const updated = await updateLead(id, patch);
  if (!updated) return new Response('Not found', { status: 404 });

  return new Response(JSON.stringify(updated), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const DELETE: APIRoute = async ({ params, cookies }) => {
  const session = cookies.get(SESSION_COOKIE)?.value;
  if (session !== SESSION_VALUE) return new Response('Unauthorized', { status: 401 });

  const id = params.id;
  if (!id) return new Response('Missing id', { status: 400 });

  const deleted = await deleteLead(id);
  if (!deleted) return new Response('Not found', { status: 404 });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

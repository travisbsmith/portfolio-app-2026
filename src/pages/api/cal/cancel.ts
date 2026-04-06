import type { APIRoute } from 'astro';
import { getLeads, updateLead } from '../../../lib/leads';
import { SESSION_COOKIE, SESSION_VALUE } from '../../../lib/auth';

export const prerender = false;

function isAuthed(cookies: Parameters<APIRoute>[0]['cookies']): boolean {
  return cookies.get(SESSION_COOKIE)?.value === SESSION_VALUE;
}

export const POST: APIRoute = async ({ cookies, request }) => {
  if (!isAuthed(cookies)) return new Response('Unauthorized', { status: 401 });

  let body: { leadId: string };
  try { body = await request.json(); } catch {
    return new Response('Bad request', { status: 400 });
  }

  const leads = await getLeads();
  const lead = leads.find(l => l.id === body.leadId);
  if (!lead) return new Response('Not found', { status: 404 });
  if (!lead.calBookingUid) {
    return new Response(JSON.stringify({ error: 'No Cal.com booking UID on this lead' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const calApiKey = import.meta.env.CAL_API_KEY ?? process.env.CAL_API_KEY;
  if (!calApiKey) {
    return new Response(JSON.stringify({ error: 'CAL_API_KEY not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Cancel the booking via Cal.com v1 API
  const calRes = await fetch(
    `https://api.cal.com/v1/bookings/${lead.calBookingUid}/cancel?apiKey=${calApiKey}`,
    {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Cancelled from CRM' }),
    }
  );

  if (!calRes.ok) {
    const errText = await calRes.text();
    console.error('Cal.com cancel failed:', errText);
    return new Response(JSON.stringify({ error: 'Cal.com cancel failed', detail: errText }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Clear meeting fields and revert stage
  const note = `Call cancelled from CRM — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  await updateLead(lead.id, {
    nextMeeting: '',
    nextMeetingISO: '',
    calBookingUid: '',
    meetingType: '',
    stage: 'Lead',
    internalNotes: lead.internalNotes ? `${lead.internalNotes}\n\n${note}` : note,
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

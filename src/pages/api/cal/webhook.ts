import type { APIRoute } from 'astro';
import { saveLead, getLeads, updateLead, type Lead } from '../../../lib/leads';
import { sendEmail } from '../email/send';
import { createHmac, timingSafeEqual } from 'crypto';

export const prerender = false;

function verifySignature(body: string, signature: string, secret: string): boolean {
  try {
    const hmac = createHmac('sha256', secret);
    hmac.update(body);
    const expected = hmac.digest('hex');
    const a = Buffer.from(signature.replace('sha256=', ''), 'hex');
    const b = Buffer.from(expected, 'hex');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function formatMeetingTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
    timeZone: 'America/Chicago',
  });
}

function dashboardLink(id: string): string {
  return `<a href="https://app.fully-operational.com/dashboard/${id}" style="color:#ff5722">View in Dashboard →</a>`;
}

const ok = () => new Response(JSON.stringify({ ok: true }), {
  status: 200, headers: { 'Content-Type': 'application/json' },
});

export const POST: APIRoute = async ({ request }) => {
  const rawBody = await request.text();
  let payload: any;

  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response('Bad JSON', { status: 400 });
  }

  const secret = import.meta.env.CAL_WEBHOOK_SECRET ?? process.env.CAL_WEBHOOK_SECRET;
  if (secret) {
    const sig = request.headers.get('x-cal-signature-256') ?? '';
    if (!verifySignature(rawBody, sig, secret)) {
      return new Response('Unauthorized', { status: 401 });
    }
  }

  const trigger: string = payload.triggerEvent ?? '';
  const booking = payload.payload ?? {};
  const attendees: any[] = booking.attendees ?? [];
  const guest = attendees[0] ?? {};
  const responses = booking.responses ?? {};
  const bookingUid: string = booking.uid ?? '';
  const name: string = guest.name ?? responses.name?.value ?? 'Unknown';
  const email: string = guest.email ?? responses.email?.value ?? '';
  const meetingType: string = booking.eventType?.title ?? booking.title ?? '';

  // ── Cancellation + reschedule: shared leads fetch ─────────────────────────
  if (trigger === 'BOOKING_CANCELLED' || trigger === 'BOOKING_RESCHEDULED') {
    const leads = await getLeads();
    const existing = leads.find(l =>
      l.calBookingUid === bookingUid || l.email.toLowerCase() === email.toLowerCase()
    );

    if (trigger === 'BOOKING_CANCELLED') {
      if (existing) {
        const note = `Call cancelled (cal.com) — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
        await updateLead(existing.id, {
          nextMeeting: '',
          nextMeetingISO: '',
          stage: 'Lead',
          internalNotes: existing.internalNotes ? `${existing.internalNotes}\n\n${note}` : note,
        });
        try {
          await sendEmail({
            to: 'travis@fully-operational.com',
            subject: `Call cancelled: ${name}`,
            html: `<p style="font-family:monospace"><strong>${name}</strong> cancelled their call.<br><br>${dashboardLink(existing.id)}</p>`,
          });
        } catch { /* non-fatal */ }
      }
      return ok();
    }

    if (trigger === 'BOOKING_RESCHEDULED') {
      const startISO: string = booking.startTime ?? '';
      const nextMeeting = startISO ? formatMeetingTime(startISO) : '';
      if (existing) {
        await updateLead(existing.id, {
          nextMeeting,
          nextMeetingISO: startISO,
          calBookingUid: bookingUid,
          meetingType: meetingType || existing.meetingType,
          stage: 'Call Scheduled',
        });
        try {
          await sendEmail({
            to: 'travis@fully-operational.com',
            subject: `Call rescheduled: ${name} → ${nextMeeting}`,
            html: `<p style="font-family:monospace"><strong>${name}</strong> rescheduled.<br>New time: <strong>${nextMeeting}</strong><br><br>${dashboardLink(existing.id)}</p>`,
          });
        } catch { /* non-fatal */ }
      }
      return ok();
    }
  }

  // ── Skip unknown events ────────────────────────────────────────────────────
  if (trigger !== 'BOOKING_CREATED') {
    return new Response(JSON.stringify({ ok: true, skipped: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }

  // ── New booking ────────────────────────────────────────────────────────────
  const startISO: string = booking.startTime ?? '';
  const nextMeeting = startISO ? formatMeetingTime(startISO) : 'TBD';
  const now = new Date().toISOString();

  const lead: Lead = {
    id: `lead_${Date.now()}`,
    name,
    email,
    storeUrl:          responses.store_url?.value ?? '',
    storeStatus:       responses.store_status?.value ?? '',
    challenge:         responses.challenge?.value ?? '',
    serviceInterest:   responses.service_interest?.value ?? '',
    availability:      nextMeeting,
    timezone:          guest.timeZone ?? '',
    referral:          responses.referral?.value ?? '',
    additionalNotes:   responses.notes?.value ?? booking.additionalNotes ?? booking.description ?? '',
    launchDate:        responses.launch_date?.value ?? '',
    hasVisualDesigner: responses.has_visual_designer?.value ?? '',
    nextMeeting,
    nextMeetingISO:    startISO,
    calBookingUid:     bookingUid,
    meetingType:       meetingType || undefined,
    stage:             'Call Scheduled',
    internalNotes:     `Booked via cal.com — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
    stripeCustomerId:  '',
    createdAt:         now,
    updatedAt:         now,
  };

  try {
    await saveLead(lead);
  } catch (e) {
    console.error('KV save failed:', e);
    return new Response(JSON.stringify({ ok: false, error: 'KV save failed' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const rows = [
      ['Name', name], ['Email', `<a href="mailto:${email}">${email}</a>`],
      ['Call time', `<strong>${nextMeeting}</strong>`],
      ...(lead.storeUrl        ? [['Store URL',    lead.storeUrl]]        : []),
      ...(lead.storeStatus     ? [['Store status', lead.storeStatus]]     : []),
      ...(lead.serviceInterest ? [['Interested in',lead.serviceInterest]] : []),
      ...(lead.challenge       ? [['Challenge',    lead.challenge]]       : []),
      ...(lead.referral        ? [['Referral',     lead.referral]]        : []),
      ...(lead.additionalNotes ? [['Notes',        lead.additionalNotes]] : []),
    ].map(([l, v]) => `<tr><td style="padding:6px 12px;color:#666;white-space:nowrap">${l}</td><td style="padding:6px 12px">${v}</td></tr>`).join('');

    await sendEmail({
      to: 'travis@fully-operational.com',
      subject: `Call booked: ${name} — ${nextMeeting}`,
      html: `
        <h2 style="font-family:monospace;margin-bottom:16px">New call booked via cal.com</h2>
        <table style="border-collapse:collapse;width:100%;font-family:monospace;font-size:14px">${rows}</table>
        <p style="margin-top:24px">${dashboardLink(lead.id)}</p>
      `,
    });
  } catch (e) {
    console.error('Notification email failed:', e);
  }

  return new Response(JSON.stringify({ ok: true, id: lead.id }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};

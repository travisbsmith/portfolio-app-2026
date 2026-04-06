import type { APIRoute } from 'astro';
import { getLeads, updateLead } from '../../lib/leads';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const token = url.searchParams.get('token');

  const html = (heading: string, body: string) => new Response(
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${heading} — Travis Smith</title>
    <style>body{font-family:system-ui,sans-serif;max-width:480px;margin:80px auto;padding:0 24px;color:#1a1a1a}h1{font-size:1.5rem;font-weight:500;margin-bottom:12px}p{color:#555;line-height:1.6}a{color:#ff5722}</style>
    </head><body><h1>${heading}</h1><p>${body}</p><p><a href="https://fully-operational.com">fully-operational.com</a></p></body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html' } }
  );

  if (!token) {
    return html('Invalid link', 'This unsubscribe link is missing a token. Please contact <a href="mailto:travis@fully-operational.com">travis@fully-operational.com</a> to stop receiving reminders.');
  }

  const leads = await getLeads();
  const lead = leads.find(l => l.unsubscribeToken === token);

  if (!lead) {
    return html('Already unsubscribed', 'You\'re not receiving any reminders — nothing to do here.');
  }

  if (lead.unsubscribed) {
    return html('Already unsubscribed', 'You\'ve already been removed from reminder emails. You won\'t hear from us again.');
  }

  await updateLead(lead.id, { unsubscribed: true });

  return html('You\'re unsubscribed', 'Done — you won\'t receive any more reminder emails. If you ever want to reconnect, just email <a href="mailto:travis@fully-operational.com">travis@fully-operational.com</a>.');
};

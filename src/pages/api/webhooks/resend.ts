import type { APIRoute } from 'astro';
import { getLeads, updateLead } from '../../../lib/leads';

export const prerender = false;

// Basic helper to extract plain email from standard format "Name <email@domain.com>"
function extractEmail(fromField: string): string {
  const match = fromField.match(/<([^>]+)>/);
  return match ? match[1].toLowerCase().trim() : fromField.toLowerCase().trim();
}

export const POST: APIRoute = async ({ request }) => {
  try {
    // 1. Parse Resend webhook payload
    const payload = await request.json();
    
    // Check if this is the correct event type
    if (payload.type !== 'email.received') {
      return new Response(JSON.stringify({ status: 'ignored', reason: 'Not an email.received event' }), { status: 200 });
    }

    const { from, text, html, subject } = payload.data;
    if (!from) {
      return new Response(JSON.stringify({ status: 'error', reason: 'No sender found' }), { status: 400 });
    }

    const senderEmail = extractEmail(from);

    // 2. Lookup lead by email
    const leads = await getLeads();
    const lead = leads.find(l => l.email.toLowerCase() === senderEmail);

    if (!lead) {
      console.info(`Webhook: Received email from unknown sender ${senderEmail}, ignoring.`);
      return new Response(JSON.stringify({ status: 'ignored', reason: 'Sender not recognized' }), { status: 200 });
    }

    // 3. Format the incoming email as an ActivityEntry
    const bodyText = text || html || '(No body content)';
    const cleanBody = `**Update from client (${subject || 'No Subject'}):**\n\n${bodyText}`;

    const newActivity = {
      id: crypto.randomUUID(),
      type: 'Email' as const,
      text: cleanBody,
      createdAt: new Date().toISOString()
    };

    // 4. Save to lead
    const currentLog = lead.activityLog || [];
    await updateLead(lead.id, {
      activityLog: [newActivity, ...currentLog]
    });

    console.info(`Webhook: Logged inbound email from ${senderEmail} to lead ${lead.id}`);

    return new Response(JSON.stringify({ status: 'success' }), { status: 200 });
  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
  }
};

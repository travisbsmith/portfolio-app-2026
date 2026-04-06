import type { APIRoute } from 'astro';
import { Resend } from 'resend';

export const prerender = false;

// Exported helper so webhook.ts and followup/check.ts can call it directly
const TRAVIS = 'travis@fully-operational.com';

export async function sendEmail({
  to,
  subject,
  html,
  replyTo = TRAVIS,
}: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}): Promise<{ id?: string; error?: string }> {
  const resend = new Resend(import.meta.env.RESEND_API_KEY ?? process.env.RESEND_API_KEY);
  // CC Travis on all client-facing emails so he has a record in his inbox
  const isToTravis = to === TRAVIS || to.includes(TRAVIS);
  const { data, error } = await resend.emails.send({
    from: `Travis Smith <${TRAVIS}>`,
    to,
    ...(isToTravis ? {} : { cc: TRAVIS }),
    replyTo,
    subject,
    html,
  });
  if (error) {
    console.error('Resend error:', error);
    return { error: error.message };
  }
  return { id: data?.id };
}

// Also exposed as an API route for the dashboard's "Send Follow-up" button
export const POST: APIRoute = async ({ request }) => {
  const { to, subject, html } = await request.json();
  if (!to || !subject || !html) {
    return new Response(JSON.stringify({ error: 'Missing fields' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const result = await sendEmail({ to, subject, html });
  return new Response(JSON.stringify(result), {
    status: result.error ? 500 : 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

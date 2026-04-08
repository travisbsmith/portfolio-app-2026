import type { APIRoute } from 'astro';
import { Resend } from 'resend';

export const prerender = false;

// Exported helper so webhook.ts and followup/check.ts can call it directly
const TRAVIS = 'travis@fully-operational.com';
const REPLY_TO_DOMAIN = import.meta.env.INBOUND_EMAIL_DOMAIN ?? process.env.INBOUND_EMAIL_DOMAIN ?? 'reply.fully-operational.com';
const DEFAULT_REPLY_TO = `travis@${REPLY_TO_DOMAIN}`;

function parseRecipients(value?: string | string[]): string[] {
  if (!value) return [];
  const parts = Array.isArray(value) ? value : [value];
  return parts
    .flatMap((entry) => entry.split(','))
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function uniqueRecipients(value: string[]): string[] {
  return [...new Set(value.map((entry) => entry.toLowerCase()))];
}

function summarizeRecipients(value: string | string[] | undefined): string[] {
  return uniqueRecipients(parseRecipients(value));
}

export async function sendEmail({
  to,
  subject,
  html,
  replyTo = DEFAULT_REPLY_TO,
  cc,
}: {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
  cc?: string | string[];
}): Promise<{ id?: string; error?: string }> {
  const apiKey = import.meta.env.RESEND_API_KEY ?? process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('Resend error: missing RESEND_API_KEY');
    return { error: 'Missing RESEND_API_KEY' };
  }

  const resend = new Resend(apiKey);
  const toRecipients = uniqueRecipients(parseRecipients(to));
  const configuredCc = parseRecipients(import.meta.env.EMAIL_CC ?? process.env.EMAIL_CC ?? TRAVIS);
  const requestedCc = parseRecipients(cc);
  const ccRecipients = uniqueRecipients([...configuredCc, ...requestedCc]).filter(
    (recipient) => !toRecipients.includes(recipient),
  );

  console.info('Sending email', {
    to: toRecipients,
    cc: ccRecipients,
    replyTo,
    subject,
  });

  const { data, error } = await resend.emails.send({
    from: `Travis Smith <${TRAVIS}>`,
    to,
    ...(ccRecipients.length > 0 ? { bcc: ccRecipients } : {}),
    replyTo,
    subject,
    html: `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
      h2 { color: #111; margin-top: 0; }
      h3 { color: #222; margin-top: 24px; }
      p { margin: 16px 0; }
      a { color: #2b6cb0; text-decoration: none; }
      a:hover { text-decoration: underline; }
      ul { padding-left: 20px; }
      li { margin-bottom: 8px; }
    </style>
  </head>
  <body>
    ${html}
  </body>
</html>`,
  });
  if (error) {
    console.error('Resend error:', error);
    return { error: error.message };
  }

  console.info('Email sent', {
    id: data?.id,
    to: summarizeRecipients(to),
    cc: ccRecipients,
    replyTo,
    subject,
  });

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

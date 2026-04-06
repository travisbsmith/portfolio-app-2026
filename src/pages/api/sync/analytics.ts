import type { APIRoute } from 'astro';
import { createClient } from '@vercel/kv';

export const prerender = false;

const UMAMI_API_URL = 'https://api.umami.is/v1';
const UMAMI_WEBSITE_ID = 'c6cedcf7-fb2d-4ff2-bf5f-8a584da45fb6';

async function fetchJson(endpoint: string, apiKey: string): Promise<any> {
  const res = await fetch(`${UMAMI_API_URL}${endpoint}`, {
    headers: { 'x-umami-api-key': apiKey, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Umami API error ${res.status}: ${await res.text()}`);
  return res.json();
}

export const GET: APIRoute = async ({ request }) => {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const apiKey = process.env.UMAMI_API_KEY;
  if (!apiKey) return new Response('UMAMI_API_KEY not set', { status: 500 });

  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;
  if (!kvUrl || !kvToken) return new Response('KV env vars not set', { status: 500 });

  const now = Date.now();
  const ranges: Record<string, number> = {
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
    '90d': 90 * 24 * 60 * 60 * 1000,
  };

  const num = (v: any) => (typeof v === 'number' ? v : v?.value ?? 0);

  const periods: Record<string, any> = {};
  for (const [period, ms] of Object.entries(ranges)) {
    const data = await fetchJson(
      `/websites/${UMAMI_WEBSITE_ID}/stats?startAt=${now - ms}&endAt=${now}`,
      apiKey
    );
    periods[period] = {
      pageviews: num(data.pageviews),
      visitors: num(data.visitors),
      visits: num(data.visits),
      bounces: num(data.bounces),
      totaltime: num(data.totaltime),
    };
  }

  const weekAgo = now - ranges['7d'];
  const toMetric = (items: any[]) =>
    (items || []).map((i: any) => ({ x: i.x || '(unknown)', y: i.y || 0 }));

  const [pages, referrers, countries, devices] = await Promise.all([
    fetchJson(`/websites/${UMAMI_WEBSITE_ID}/metrics?startAt=${weekAgo}&endAt=${now}&type=url`, apiKey),
    fetchJson(`/websites/${UMAMI_WEBSITE_ID}/metrics?startAt=${weekAgo}&endAt=${now}&type=referrer`, apiKey),
    fetchJson(`/websites/${UMAMI_WEBSITE_ID}/metrics?startAt=${weekAgo}&endAt=${now}&type=country`, apiKey),
    fetchJson(`/websites/${UMAMI_WEBSITE_ID}/metrics?startAt=${weekAgo}&endAt=${now}&type=device`, apiKey),
  ]);

  const cache = {
    lastSynced: new Date().toISOString(),
    periods,
    pages: toMetric(pages).slice(0, 20),
    referrers: toMetric(referrers).slice(0, 15),
    countries: toMetric(countries).slice(0, 10),
    devices: toMetric(devices).slice(0, 5),
  };

  const kv = createClient({ url: kvUrl, token: kvToken });
  await kv.set('analytics-cache', cache);

  return new Response(JSON.stringify({ ok: true, lastSynced: cache.lastSynced }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

/**
 * Sync analytics data from Umami API to local cache
 * 
 * This script fetches analytics from the Umami Cloud API and saves
 * the data to a local JSON file. The dashboard reads from this cache.
 * 
 * Usage: npx tsx scripts/sync-analytics.ts
 */

import * as fs from 'fs';
import * as path from 'path';

const UMAMI_API_URL = 'https://api.umami.is/v1';
const UMAMI_WEBSITE_ID = 'c6cedcf7-fb2d-4ff2-bf5f-8a584da45fb6';
const UMAMI_API_KEY = process.env.UMAMI_API_KEY;
if (!UMAMI_API_KEY) throw new Error('UMAMI_API_KEY env var is required');
const CACHE_FILE = path.join(process.cwd(), 'src/data/analytics-cache.json');

interface AnalyticsCache {
  lastSynced: string;
  periods: {
    '24h': PeriodData;
    '7d': PeriodData;
    '30d': PeriodData;
    '90d': PeriodData;
  };
  pages: MetricItem[];
  referrers: MetricItem[];
  countries: MetricItem[];
  devices: MetricItem[];
}

interface PeriodData {
  pageviews: number;
  visitors: number;
  visits: number;
  bounces: number;
  totaltime: number;
}

interface MetricItem {
  x: string;
  y: number;
}

async function fetchJson(endpoint: string): Promise<any> {
  const url = `${UMAMI_API_URL}${endpoint}`;
  const response = await fetch(url, {
    headers: {
      'x-umami-api-key': UMAMI_API_KEY,
      'Content-Type': 'application/json',
    },
  });
  
  if (!response.ok) {
    throw new Error(`API error ${response.status}: ${await response.text()}`);
  }
  
  return response.json();
}

async function fetchStats(startAt: number, endAt: number): Promise<PeriodData> {
  const data = await fetchJson(
    `/websites/${UMAMI_WEBSITE_ID}/stats?startAt=${startAt}&endAt=${endAt}`
  );
  // Umami returns flat numbers: { pageviews: 213, visitors: 71, ... }
  const num = (v: any) => (typeof v === 'number' ? v : v?.value ?? 0);
  return {
    pageviews: num(data.pageviews),
    visitors: num(data.visitors),
    visits: num(data.visits),
    bounces: num(data.bounces),
    totaltime: num(data.totaltime),
  };
}

async function fetchMetrics(startAt: number, endAt: number, type: string): Promise<MetricItem[]> {
  const data = await fetchJson(
    `/websites/${UMAMI_WEBSITE_ID}/metrics?startAt=${startAt}&endAt=${endAt}&type=${type}`
  );
  return (data || []).map((item: any) => ({
    x: item.x || '(unknown)',
    y: item.y || 0,
  }));
}

async function syncAnalytics(): Promise<void> {
  console.log('📊 Syncing analytics data...');
  
  const now = Date.now();
  const ranges: Record<string, number> = {
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
    '90d': 90 * 24 * 60 * 60 * 1000,
  };

  try {
    // Fetch stats for each period
    console.log('   Fetching stats for all periods...');
    const periods: Record<string, PeriodData> = {} as any;
    for (const [period, ms] of Object.entries(ranges)) {
      periods[period] = await fetchStats(now - ms, now);
      console.log(`   ✓ ${period}: ${periods[period].pageviews} views, ${periods[period].visitors} visitors`);
    }

    // Fetch detailed metrics for the 7-day period
    const weekAgo = now - ranges['7d'];
    console.log('   Fetching detailed metrics (7d)...');
    
    const pages = await fetchMetrics(weekAgo, now, 'url');
    const referrers = await fetchMetrics(weekAgo, now, 'referrer');
    const countries = await fetchMetrics(weekAgo, now, 'country');
    const devices = await fetchMetrics(weekAgo, now, 'device');

    const cache: AnalyticsCache = {
      lastSynced: new Date().toISOString(),
      periods: periods as AnalyticsCache['periods'],
      pages: pages.slice(0, 20),
      referrers: referrers.slice(0, 15),
      countries: countries.slice(0, 10),
      devices: devices.slice(0, 5),
    };

    // Ensure directory exists
    const cacheDir = path.dirname(CACHE_FILE);
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));

    console.log(`✅ Analytics synced successfully`);
    console.log(`   ${pages.length} pages, ${referrers.length} referrers, ${countries.length} countries`);
    console.log(`   Cache saved to: ${CACHE_FILE}`);

  } catch (error) {
    console.error('❌ Failed to sync analytics:', error);
    
    if (fs.existsSync(CACHE_FILE)) {
      const existing = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
      console.log(`⚠️  Using existing cache from ${existing.lastSynced}`);
    } else {
      // Create empty cache
      const emptyCache: AnalyticsCache = {
        lastSynced: new Date().toISOString(),
        periods: {
          '24h': { pageviews: 0, visitors: 0, visits: 0, bounces: 0, totaltime: 0 },
          '7d': { pageviews: 0, visitors: 0, visits: 0, bounces: 0, totaltime: 0 },
          '30d': { pageviews: 0, visitors: 0, visits: 0, bounces: 0, totaltime: 0 },
          '90d': { pageviews: 0, visitors: 0, visits: 0, bounces: 0, totaltime: 0 },
        },
        pages: [],
        referrers: [],
        countries: [],
        devices: [],
      };
      
      const cacheDir = path.dirname(CACHE_FILE);
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
      }
      fs.writeFileSync(CACHE_FILE, JSON.stringify(emptyCache, null, 2));
      console.log('⚠️  Created empty cache.');
    }
    
    process.exit(0);
  }
}

syncAnalytics();

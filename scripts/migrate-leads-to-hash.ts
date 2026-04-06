/**
 * One-time migration: moves leads from a single JSON array (key "leads")
 * to a Redis hash (key "leads", field per lead ID).
 *
 * Safe to run multiple times — existing hash fields are overwritten with the
 * same data. Run against production env vars, verify, then deploy the new leads.ts.
 *
 * Usage:
 *   KV_REST_API_URL=... KV_REST_API_TOKEN=... npx tsx scripts/migrate-leads-to-hash.ts
 */

import { createClient } from '@vercel/kv';

const url = process.env.KV_REST_API_URL;
const token = process.env.KV_REST_API_TOKEN;

if (!url || !token) {
  console.error('KV_REST_API_URL and KV_REST_API_TOKEN must be set');
  process.exit(1);
}

const kv = createClient({ url, token });

async function migrate() {
  console.log('Reading existing leads array...');

  // Try reading the old array format
  const existing = await kv.get<any>('leads');

  if (!existing) {
    console.log('No data found at key "leads" — nothing to migrate.');
    return;
  }

  if (!Array.isArray(existing)) {
    console.log('Key "leads" is not an array — may already be a hash. Checking...');
    const hash = await kv.hgetall('leads');
    if (hash) {
      const count = Object.keys(hash).length;
      console.log(`Found ${count} fields in hash — already migrated.`);
    } else {
      console.log('Unknown format. Inspect manually.');
    }
    return;
  }

  console.log(`Found ${existing.length} leads to migrate.`);

  if (existing.length === 0) {
    console.log('No leads to migrate.');
    return;
  }

  // Write each lead as a hash field
  const entries: Record<string, string> = {};
  for (const lead of existing) {
    if (!lead.id) {
      console.warn('Skipping lead with no id:', lead);
      continue;
    }
    entries[lead.id] = JSON.stringify(lead);
  }

  console.log(`Writing ${Object.keys(entries).length} leads to hash...`);

  // Backup the old array under a different key before overwriting
  await kv.set('leads_array_backup', existing);
  console.log('Backed up old array to "leads_array_backup"');

  // Delete the old string key before writing the hash
  await kv.del('leads');

  // Write all leads as hash fields
  await kv.hset('leads', entries);
  console.log('Migration complete.');

  // Verify
  const hash = await kv.hgetall('leads');
  const migratedCount = hash ? Object.keys(hash).length : 0;
  console.log(`Verified: ${migratedCount} leads now in hash.`);

  if (migratedCount !== Object.keys(entries).length) {
    console.error('Count mismatch — check migration output.');
    process.exit(1);
  }

  console.log('\nNext step: deploy the updated src/lib/leads.ts, then delete the backup:');
  console.log('  kv.del("leads_array_backup")');
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});

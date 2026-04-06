// One-time script to import existing leads from Basin/Google Sheets into KV
// Usage: bun scripts/import-leads.ts <CRON_SECRET>

const secret = process.argv[2];
if (!secret) {
  console.error('Usage: bun scripts/import-leads.ts <CRON_SECRET>');
  process.exit(1);
}

const BASE = 'https://www.fully-operational.com';

const leads = [
  {
    name: 'Gabi Lewis',
    email: 'gabi@badebody.com',
    store_url: '',
    store_status: 'In progress, not live',
    challenge: 'Getting my store ready for launch this summer, currently have a wait list landing page. Keen to create a premium looking, high converting store.',
    service_interest: 'Store Launch Sprint ($1,800)',
    availability: 'Thursday — Midday (11am–1pm CT)',
    timezone: 'GMT (but in Miami for next 2 weeks)',
    referral: 'Karli Kujawa',
    notes: '',
  },
  {
    name: 'Sabrina Rohde',
    email: 'hello@rohdevene.com',
    store_url: 'https://www.rohdevene.com/',
    store_status: 'Live and selling',
    challenge: "Sales funnel optimization and I'm joining a Stanford University Accelerator starting April 1 where I will consistently A/B test messaging. Would love to know best practice for set-up.",
    service_interest: 'Clarity Session ($350)',
    availability: 'Wednesday — Morning (8–11am CT)',
    timezone: 'PST',
    referral: 'WhatsApp tote group',
    notes: 'Serial business builder (b2b), Stanford MBA candidate now building a consumer brand.',
  },
];

for (const lead of leads) {
  const res = await fetch(`${BASE}/api/leads/new?secret=${secret}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(lead),
  });
  const text = await res.text();
  try {
    const json = JSON.parse(text);
    if (res.ok) {
      console.log(`✓ Imported ${lead.name} (${json.id})`);
    } else {
      console.error(`✗ Failed ${lead.name}:`, json);
    }
  } catch {
    console.error(`✗ Failed ${lead.name}: HTTP ${res.status}`, text.slice(0, 200));
  }
}

console.log('Done.');

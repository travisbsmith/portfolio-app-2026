export interface TimeEntry {
  id: string;
  leadId: string;
  date: string;        // YYYY-MM-DD
  hours: number;
  description: string;
  createdAt: string;
}

function kvHeaders(): Record<string, string> {
  const token = import.meta.env.KV_REST_API_TOKEN ?? process.env?.KV_REST_API_TOKEN;
  if (!token) throw new Error('KV_REST_API_TOKEN not set');
  return { Authorization: `Bearer ${token}` };
}

function kvBase(): string {
  const base = import.meta.env.KV_REST_API_URL ?? process.env?.KV_REST_API_URL;
  if (!base) throw new Error('KV_REST_API_URL not set');
  return base;
}

export async function getTimeEntries(leadId: string): Promise<TimeEntry[]> {
  try {
    const res = await fetch(`${kvBase()}/get/time_${leadId}`, { 
      headers: kvHeaders(),
      cache: 'no-store'
    });
    const json = await res.json() as { result: string | null };
    if (!json.result) return [];
    const val = json.result;
    const parsed = typeof val === 'string' ? JSON.parse(val) : val;
    return typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
  } catch { return []; }
}

async function setTimeEntries(leadId: string, entries: TimeEntry[]): Promise<void> {
  await fetch(`${kvBase()}/set/time_${leadId}`, {
    method: 'POST',
    headers: { ...kvHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(JSON.stringify(entries)),
  });
}

export async function addTimeEntry(entry: TimeEntry): Promise<void> {
  const entries = await getTimeEntries(entry.leadId);
  entries.unshift(entry);
  await setTimeEntries(entry.leadId, entries);
}

export async function deleteTimeEntry(leadId: string, entryId: string): Promise<void> {
  const entries = await getTimeEntries(leadId);
  const updated = entries.filter(e => e.id !== entryId);
  await setTimeEntries(leadId, updated);
}

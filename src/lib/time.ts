export interface TimeEntry {
  id: string;
  leadId: string;
  date: string;        // YYYY-MM-DD
  hours: number;
  description: string;
  createdAt: string;
}

import { createClient } from '@vercel/kv';

const url = process.env.KV_REST_API_URL;
const token = process.env.KV_REST_API_TOKEN;
const kv = createClient({ url: url as string, token: token as string });

export async function getTimeEntries(leadId: string): Promise<TimeEntry[]> {
  try {
    const data = await kv.get<string | TimeEntry[]>(`time_${leadId}`);
    if (!data) return [];
    if (typeof data === 'string') return JSON.parse(data);
    return data;
  } catch { return []; }
}

async function setTimeEntries(leadId: string, entries: TimeEntry[]): Promise<void> {
  await kv.set(`time_${leadId}`, entries);
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

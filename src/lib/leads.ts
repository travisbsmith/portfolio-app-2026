export type LeadStage = 'Lead' | 'Call Scheduled' | 'Proposal Sent' | 'Active' | 'Closed' | 'Archived';

export interface ActivityEntry {
  id: string;
  type: 'Note' | 'Call' | 'Email';
  text: string;
  createdAt: string;
}

export interface Deliverable {
  id: string;
  title: string;
  status: 'pending' | 'in-progress' | 'done';
}

export interface TodoItem {
  id: string;
  text: string;
  done: boolean;
  createdAt: string;
}

export interface Lead {
  id: string;
  name: string;
  email: string;
  storeUrl: string;
  storeStatus: string;
  challenge: string;
  serviceInterest: string;
  availability?: string;
  timezone?: string;
  referral?: string;
  additionalNotes?: string;
  launchDate?: string;
  hasVisualDesigner?: string;
  nextMeeting?: string;
  nextMeetingISO?: string;
  calBookingUid?: string;
  meetingType?: string;
  stage: LeadStage;
  internalNotes: string;
  stripeCustomerId: string;
  proposalHtml?: string;
  proposalSubject?: string;
  completedChecks?: string[];
  contractSignedAt?: string;
  proposalSentAt?: string;
  activityLog?: ActivityEntry[];
  deliverables?: Deliverable[];
  todos?: TodoItem[];
  // Reminder automation
  unsubscribeToken?: string;
  remindersDisabled?: boolean;
  unsubscribed?: boolean;
  remindersSentSchedule?: number;
  remindersSentProposal?: number;
  lastReminderScheduleAt?: string;
  lastReminderProposalAt?: string;
  createdAt: string;
  updatedAt: string;
}

const KV_KEY = 'leads';

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

export async function getLeads(): Promise<Lead[]> {
  try {
    const res = await fetch(`${kvBase()}/get/${KV_KEY}`, { headers: kvHeaders() });
    const json = await res.json() as { result: string | null };
    if (!json.result) return [];
    const val = json.result; if (!val) return []; const parsed = typeof val === "string" ? JSON.parse(val) : val; return typeof parsed === "string" ? JSON.parse(parsed) : parsed;
  } catch {
    return [];
  }
}

async function setLeads(leads: Lead[]): Promise<void> {
  await fetch(`${kvBase()}/set/${KV_KEY}`, {
    method: 'POST',
    headers: { ...kvHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(JSON.stringify(leads)),
  });
}

export async function saveLead(lead: Lead): Promise<void> {
  const leads = await getLeads();
  const idx = leads.findIndex(l => l.id === lead.id);
  if (idx >= 0) {
    leads[idx] = { ...leads[idx], ...lead, updatedAt: new Date().toISOString() };
  } else {
    leads.unshift(lead);
  }
  await setLeads(leads);
}

export async function updateLead(id: string, patch: Partial<Lead>): Promise<Lead | null> {
  const leads = await getLeads();
  const idx = leads.findIndex(l => l.id === id);
  if (idx < 0) return null;
  leads[idx] = { ...leads[idx], ...patch, updatedAt: new Date().toISOString() };
  await setLeads(leads);
  return leads[idx];
}

export async function deleteLead(id: string): Promise<boolean> {
  const leads = await getLeads();
  const filtered = leads.filter(l => l.id !== id);
  if (filtered.length === leads.length) return false;
  await setLeads(filtered);
  return true;
}

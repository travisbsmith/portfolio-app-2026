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

import { createClient } from '@vercel/kv';

const KV_KEY = 'leads';

const url = process.env.KV_REST_API_URL;
const token = process.env.KV_REST_API_TOKEN;
const kv = createClient({ url: url as string, token: token as string });

export async function getLeads(): Promise<Lead[]> {
  try {
    const data = await kv.get<string | Lead[]>(KV_KEY);
    if (!data) return [];
    if (typeof data === 'string') return JSON.parse(data);
    return data;
  } catch {
    return [];
  }
}

async function setLeads(leads: Lead[]): Promise<void> {
  await kv.set(KV_KEY, leads);
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

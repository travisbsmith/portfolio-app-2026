export interface ServiceConfig {
  label: string;
  priceCents: number;
  isRecurring: boolean;
  invoiceAmountStr: string;
  contractHoursPerMonth?: number;
}

export const SERVICES: Record<string, ServiceConfig> = {
  'Clarity Session': {
    label: 'Clarity Session',
    priceCents: 50000,
    isRecurring: false,
    invoiceAmountStr: '500',
  },
  'Store Launch Sprint': {
    label: 'Store Launch Sprint',
    priceCents: 250000,
    isRecurring: false,
    invoiceAmountStr: '2500',
  },
  'Insider Retainer': {
    label: 'Insider Retainer',
    priceCents: 350000,
    isRecurring: true,
    invoiceAmountStr: '3500',
    contractHoursPerMonth: 12,
  },
};

export function matchService(serviceInterest: string): ServiceConfig | null {
  for (const [key, config] of Object.entries(SERVICES)) {
    if (serviceInterest.startsWith(key)) return config;
  }
  return null;
}

export const STAGE_CHECKLISTS: Record<string, string[]> = {
  'Call Scheduled': [
    'Reviewed intake form',
    'Prepped call notes',
  ],
  'Proposal Sent': [
    'Proposal sent to client',
    'Invoice created in Stripe',
    'Follow-up scheduled if no response in 3 days',
  ],
  'Active': [
    'Contract signed',
    'Kickoff doc sent',
    'Shopify collaborator access granted',
    'First deliverable defined',
    'Communication cadence agreed',
  ],
  'Closed': [
    'Final deliverables sent',
    'Testimonial requested',
    'Reconnect in 90 days noted',
  ],
};

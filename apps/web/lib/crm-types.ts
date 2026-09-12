export type LeadStatus =
  "NEW" | "CONTACTED" | "QUALIFIED" | "LOST" | "CONVERTED";

export type OpportunityStage =
  "QUALIFIED" | "NEEDS_ANALYSIS" | "PROPOSAL" | "NEGOTIATION" | "WON" | "LOST";

export type CrmLead = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  source: string;
  status: LeadStatus;
  interestNote: string | null;
  customerId: string | null;
  ownerUserId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  opportunityId: string | null;
  opportunityStage: OpportunityStage | null;
  estimatedValue: string | number | null;
};

export type CrmOpportunity = {
  id: string;
  leadId: string | null;
  customerId: string | null;
  title: string;
  stage: OpportunityStage;
  estimatedValue: string | number | null;
  currency: string;
  probability: number;
  expectedCloseDate: string | null;
  ownerUserId: string | null;
  version: number;
  leadFirstName: string | null;
  leadLastName: string | null;
  updatedAt: string;
};

export type CrmFollowUp = {
  id: string;
  leadId: string | null;
  opportunityId: string | null;
  assignedUserId: string;
  channel: "CALL" | "SMS" | "EMAIL" | "WHATSAPP" | "IN_PERSON" | "OTHER";
  status: "OPEN" | "COMPLETED" | "CANCELLED";
  dueAt: string;
  note: string | null;
  outcome: string | null;
  completedAt: string | null;
  createdAt: string;
};

export type CrmEvent = {
  id: string;
  eventType: string;
  actorUserId: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type CrmAssignee = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
};

export type CrmLeadDetail = CrmLead & {
  opportunities: Array<
    Pick<
      CrmOpportunity,
      | "id"
      | "title"
      | "stage"
      | "estimatedValue"
      | "currency"
      | "probability"
      | "expectedCloseDate"
      | "version"
      | "updatedAt"
    > & { lostReason?: string | null; createdAt?: string }
  >;
  followUps: CrmFollowUp[];
  events: CrmEvent[];
};

export const leadSourceLabels: Record<string, string> = {
  MANUAL: "Manuel",
  INSTAGRAM: "Instagram",
  GOOGLE: "Google",
  REFERRAL: "Tavsiye",
  WALK_IN: "Doğrudan",
  WEBSITE: "Web sitesi",
  OTHER: "Diğer",
};

export const leadStatusLabels: Record<LeadStatus, string> = {
  NEW: "Yeni",
  CONTACTED: "İletişime geçildi",
  QUALIFIED: "Nitelikli",
  LOST: "Kaybedildi",
  CONVERTED: "Dönüştü",
};

export const opportunityStageLabels: Record<OpportunityStage, string> = {
  QUALIFIED: "Nitelikli",
  NEEDS_ANALYSIS: "İhtiyaç analizi",
  PROPOSAL: "Teklif",
  NEGOTIATION: "Görüşme",
  WON: "Kazanıldı",
  LOST: "Kaybedildi",
};

export const followUpChannelLabels: Record<CrmFollowUp["channel"], string> = {
  CALL: "Telefon",
  SMS: "SMS",
  EMAIL: "E-posta",
  WHATSAPP: "WhatsApp",
  IN_PERSON: "Yüz yüze",
  OTHER: "Diğer",
};

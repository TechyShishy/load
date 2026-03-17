import { z } from 'zod';
import {
  LoseReason,
  Period,
  PhaseId,
  Track,
} from './types.js';

// ─── Enum Schemas ─────────────────────────────────────────────────────────────

export const PeriodSchema = z.nativeEnum(Period);
export const TrackSchema = z.nativeEnum(Track);
export const PhaseIdSchema = z.nativeEnum(PhaseId);
export const LoseReasonSchema = z.nativeEnum(LoseReason);

// ─── Deck Spec Schema ────────────────────────────────────────────────────────

export const DeckSpecSchema = z.object({
  templateId: z.string(),
  count: z.number().int().min(0),
});
export const DeckSpecArraySchema = z.array(DeckSpecSchema);

// ─── Board State Schemas ──────────────────────────────────────────────────────

export const SlotLayoutEntrySchema = z.object({
  period: z.string(),
  index: z.number(),
  slotType: z.string(),
});

export const VendorSlotSchema = z.object({
  index: z.number().int().min(0),
  card: z.object({ templateId: z.string(), instanceId: z.string() }).nullable(),
});

export const LedgerEntrySchema = z.object({
  kind: z.enum(['traffic-revenue', 'ticket-revenue', 'vendor-revenue', 'action-spend', 'vendor-spend', 'crisis-penalty']),
  amount: z.number().min(0),
  label: z.string(),
});

export const RoundSummarySchema = z.object({
  round: z.number(),
  budgetDelta: z.number(),
  newSlaCount: z.number(),
  resolvedCount: z.number(),
  failedCount: z.number(),
  forgivenCount: z.number().default(0),
  spawnedTrafficCount: z.number(),
  expiredTicketCount: z.number().default(0),
  ledger: z.array(LedgerEntrySchema).default([]),
});

// ─── SerializedGameContext Schema (= what lives in JSON storage) ──────────────

export const GameContextSchema = z.object({
  budget: z.number(),
  round: z.number(),
  slaCount: z.number(),
  contractId: z.string().default('standard'),
  slaLimit: z.number().default(3),
  cardTemplateIds: z.record(z.string(), z.string()),
  trafficSlotPositions: z.record(z.string(), z.object({
    period: z.string(),
    slotIndex: z.number(),
    slotType: z.string(),
  })),
  slotLayout: z.array(SlotLayoutEntrySchema),
  ticketOrders: z.record(z.string(), z.array(z.string())),
  ticketProgress: z.record(z.string(), z.number()).default({}),
  ticketIssuedRound: z.record(z.string(), z.number()).default({}),
  trafficDeckOrder: z.array(z.string()),
  trafficDiscardOrder: z.array(z.string()),
  actionDeckOrder: z.array(z.string()),
  actionDiscardOrder: z.array(z.string()),
  eventDeckOrder: z.array(z.string()),
  eventDiscardOrder: z.array(z.string()),
  handOrder: z.array(z.string()),
  playedThisRoundOrder: z.array(z.string()),
  pendingEventsOrder: z.array(z.string()),
  spawnedQueueOrder: z.array(z.string()),
  spawnedTrafficIds: z.array(z.string()).default([]),
  vendorSlots: z.array(VendorSlotSchema),
  mitigatedEventIds: z.array(z.string()),
  activePhase: PhaseIdSchema,
  lastRoundSummary: RoundSummarySchema.nullable(),
  roundHistory: z.array(RoundSummarySchema).default([]),
  loseReason: LoseReasonSchema.nullable(),
  pendingLedger: z.array(LedgerEntrySchema).default([]),
  seed: z.string(),
  skipNextTrafficDraw: z.boolean().default(false),
  revenueBoostMultiplier: z.number().default(1),
  slaForgivenessThisRound: z.number().default(0),
});


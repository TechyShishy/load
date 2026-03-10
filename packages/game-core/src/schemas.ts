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

// ─── Actor Snapshot Schemas ───────────────────────────────────────────────────

export const SerializedTrafficActorSnapshotSchema = z.object({
  status: z.literal('active'),
  value: z.string(),
  context: z.object({
    instanceId: z.string(),
    templateId: z.string(),
    period: z.string().optional(),
    slotIndex: z.number().optional(),
    slotType: z.string().optional(),
  }).passthrough(),
}).passthrough();

export const SerializedActionActorSnapshotSchema = z.object({
  status: z.literal('active'),
  value: z.string(),
  context: z.object({
    instanceId: z.string(),
    templateId: z.string(),
  }).passthrough(),
}).passthrough();

export const SerializedEventActorSnapshotSchema = z.object({
  status: z.literal('active'),
  value: z.string(),
  context: z.object({
    instanceId: z.string(),
    templateId: z.string(),
    track: z.string().optional(),
  }).passthrough(),
}).passthrough();

// ─── Board State Schemas ──────────────────────────────────────────────────────

export const SlotLayoutEntrySchema = z.object({
  period: z.string(),
  index: z.number(),
  slotType: z.string(),
});

export const VendorSlotSchema = z.object({
  index: z.number(),
  card: z.null(),
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
});

// ─── SerializedGameContext Schema (= what lives in JSON storage) ──────────────

export const GameContextSchema = z.object({
  budget: z.number(),
  round: z.number(),
  slaCount: z.number(),
  trafficActorSnapshots: z.record(z.string(), SerializedTrafficActorSnapshotSchema),
  actionActorSnapshots: z.record(z.string(), SerializedActionActorSnapshotSchema),
  eventActorSnapshots: z.record(z.string(), SerializedEventActorSnapshotSchema),
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
  loseReason: LoseReasonSchema.nullable(),
  pendingRevenue: z.number(),
  seed: z.string(),
  skipNextTrafficDraw: z.boolean().default(false),
  revenueBoostMultiplier: z.number().default(1),
  slaForgivenessThisRound: z.number().default(0),
});


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

// ─── Serialized Card Reference ────────────────────────────────────────────────

export const SerializedCardSchema = z.object({
  templateId: z.string(),
  instanceId: z.string(),
});

// ─── Board State Schemas ──────────────────────────────────────────────────────

export const SerializedTimeSlotSchema = z.object({
  period: PeriodSchema,
  index: z.number(),
  card: SerializedCardSchema.nullable(),
  temporary: z.boolean().optional(),
  weeklyTemporary: z.boolean().optional(),
  overloaded: z.boolean().optional(),
});

export const SerializedTrackSlotSchema = z.object({
  track: TrackSchema,
  tickets: z.array(SerializedCardSchema),
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
  spawnedTrafficCount: z.number(),
});

// ─── SerializedGameContext Schema (= what lives in JSON storage) ──────────────

export const GameContextSchema = z.object({
  budget: z.number(),
  round: z.number(),
  slaCount: z.number(),
  hand: z.array(SerializedCardSchema),
  playedThisRound: z.array(SerializedCardSchema),
  timeSlots: z.array(SerializedTimeSlotSchema),
  tracks: z.array(SerializedTrackSlotSchema),
  vendorSlots: z.array(VendorSlotSchema),
  pendingEvents: z.array(SerializedCardSchema),
  mitigatedEventIds: z.array(z.string()),
  activePhase: PhaseIdSchema,
  trafficDeck: z.array(SerializedCardSchema),
  trafficDiscard: z.array(SerializedCardSchema),
  eventDeck: z.array(SerializedCardSchema),
  eventDiscard: z.array(SerializedCardSchema),
  spawnedTrafficQueue: z.array(SerializedCardSchema),
  actionDeck: z.array(SerializedCardSchema),
  actionDiscard: z.array(SerializedCardSchema),
  lastRoundSummary: RoundSummarySchema.nullable(),
  loseReason: LoseReasonSchema.nullable(),
  pendingRevenue: z.number(),
  seed: z.string(),
  skipNextTrafficDraw: z.boolean().default(false),
});

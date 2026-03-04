import { z } from 'zod';
import {
  ActionEffectType,
  CardType,
  EventSubtype,
  LoseReason,
  Period,
  PhaseId,
  Track,
} from './types.js';

// ─── Enum Schemas ─────────────────────────────────────────────────────────────

export const PeriodSchema = z.nativeEnum(Period);
export const TrackSchema = z.nativeEnum(Track);
export const PhaseIdSchema = z.nativeEnum(PhaseId);
export const CardTypeSchema = z.nativeEnum(CardType);
export const EventSubtypeSchema = z.nativeEnum(EventSubtype);
export const LoseReasonSchema = z.nativeEnum(LoseReason);
export const ActionEffectTypeSchema = z.nativeEnum(ActionEffectType);

// ─── Card Schemas ─────────────────────────────────────────────────────────────

export const TrafficCardSchema = z.object({
  id: z.string(),
  type: z.literal(CardType.Traffic),
  name: z.string(),
  hoursRequired: z.number(),
  revenue: z.number(),
  description: z.string(),
});

export const EventCardSchema = z.object({
  id: z.string(),
  type: z.literal(CardType.Event),
  name: z.string(),
  subtype: EventSubtypeSchema,
  targetTrack: TrackSchema.optional(),
  spawnCount: z.number().optional(),
  spawnTrafficId: z.string().optional(),
  unmitigatedPenalty: z.number(),
  downtimePenaltyHours: z.number(),
  noOpMVP: z.boolean().optional(),
  description: z.string(),
});

export const ActionCardSchema = z.object({
  id: z.string(),
  type: z.literal(CardType.Action),
  name: z.string(),
  cost: z.number(),
  effectType: ActionEffectTypeSchema,
  effectValue: z.number(),
  targetTrack: TrackSchema.optional(),
  targetPeriod: PeriodSchema.optional(),
  targetTrafficCardId: z.string().optional(),
  description: z.string(),
  deckCount: z.number().optional(),
});

export const CardSchema = z.discriminatedUnion('type', [
  TrafficCardSchema,
  EventCardSchema,
  ActionCardSchema,
]);

// ─── Board State Schemas ──────────────────────────────────────────────────────

export const TimeSlotSchema = z.object({
  period: PeriodSchema,
  index: z.number(),
  baseCapacity: z.number(),
  cards: z.array(TrafficCardSchema),
  unavailable: z.boolean(),
  temporary: z.boolean().optional(),
});

export const TrackSlotSchema = z.object({
  track: TrackSchema,
  tickets: z.array(EventCardSchema),
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
  overloadPenalties: z.number(),
});

// ─── GameContext Schema ───────────────────────────────────────────────────────

export const GameContextSchema = z.object({
  budget: z.number(),
  round: z.number(),
  slaCount: z.number(),
  hand: z.array(ActionCardSchema),
  playedThisRound: z.array(ActionCardSchema),
  timeSlots: z.array(TimeSlotSchema),
  tracks: z.array(TrackSlotSchema),
  vendorSlots: z.array(VendorSlotSchema),
  pendingEvents: z.array(EventCardSchema),
  mitigatedEventIds: z.array(z.string()),
  activePhase: PhaseIdSchema,
  trafficEventDeck: z.array(z.union([TrafficCardSchema, EventCardSchema])),
  trafficEventDiscard: z.array(z.union([TrafficCardSchema, EventCardSchema])),
  actionDeck: z.array(ActionCardSchema),
  actionDiscard: z.array(ActionCardSchema),
  lastRoundSummary: RoundSummarySchema.nullable(),
  loseReason: LoseReasonSchema.nullable(),
  seed: z.string(),
});

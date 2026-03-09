import type { TrafficCardActorRef, ActionCardActorRef, EventCardActorRef } from './cardPositionMachines.js';

// ─── Enums ────────────────────────────────────────────────────────────────────

export enum Period {
  Morning = 'Morning',
  Afternoon = 'Afternoon',
  Evening = 'Evening',
  Overnight = 'Overnight',
}

export enum Track {
  BreakFix = 'BreakFix',
  Projects = 'Projects',
  Maintenance = 'Maintenance',
}

export enum PhaseId {
  Draw = 'Draw',
  Scheduling = 'Scheduling',
  Crisis = 'Crisis',
  Resolution = 'Resolution',
  End = 'End',
  GameWon = 'GameWon',
  GameLost = 'GameLost',
}

export enum CardType {
  Traffic = 'Traffic',
  Event = 'Event',
  Action = 'Action',
}

export enum LoseReason {
  Bankrupt = 'Bankrupt',
  SLAExceeded = 'SLAExceeded',
}

/** Classifies the sub-type of a time slot on the board. */
export enum SlotType {
  Normal = 'normal',
  Overloaded = 'overloaded',
  Temporary = 'temporary',
  WeeklyTemporary = 'weeklyTemporary',
}

/** Registries of per-card position actors keyed by instanceId. */
export type TrafficCardActorRegistry = Record<string, TrafficCardActorRef>;
export type ActionCardActorRegistry = Record<string, ActionCardActorRef>;
export type EventCardActorRegistry = Record<string, EventCardActorRef>;

export type DropZoneTarget = 'period' | 'slot' | 'occupied-slot' | 'track' | 'board';

// ─── Card Definitions ─────────────────────────────────────────────────────────

/**
 * Base class for all event cards.
 * Serialized form: { templateId, instanceId }.
 * Concrete subclasses implement onCrisis() to encode their effect.
 */
export abstract class EventCard {
  abstract readonly templateId: string;
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly label: string;
  abstract readonly description: string;
  readonly type = CardType.Event as const;

  /** Apply this event's effect. Called once per crisis phase. */
  abstract onCrisis(ctx: GameContext, mitigated: boolean): GameContext;
}

/**
 * Base class for all traffic cards.
 * Serialized form: { templateId, instanceId }.
 * Concrete subclasses may implement onPlace() for placement effects,
 * or onPickUp() for effects that fire when the card is removed from the board
 * by an action card (e.g. Traffic Prioritization, Stream Compression).
 */
export abstract class TrafficCard {
  abstract readonly templateId: string;
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly revenue: number;
  abstract readonly description: string;
  readonly type = CardType.Traffic as const;

  /** Optional hook called when the card is placed into a slot. */
  onPlace?(ctx: GameContext, slotIndex: number): GameContext;

  /** Optional hook called when the card is picked up off the board by an action card. */
  onPickUp?(ctx: GameContext, sourcePeriod: Period): GameContext;
}

/**
 * Base class for all action cards.
 * Serialized form: { templateId, instanceId }.
 * The commit() callback passed to apply() handles cost deduction, hand removal,
 * and playedThisRound tracking. The card decides when during apply() to call it.
 */
export abstract class ActionCard {
  abstract readonly templateId: string;
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly cost: number;
  abstract readonly description: string;
  abstract readonly allowedOnWeekend: boolean;
  abstract readonly validDropZones: readonly DropZoneTarget[];
  abstract readonly invalidZoneFeedback: string;
  readonly crisisOnly?: boolean;
  readonly periodZoneVariant?: 'add' | 'remove';
  /** When set, this card may only be played against events whose templateId is in this list. */
  readonly validForEventTemplateIds?: readonly string[];
  readonly type = CardType.Action as const;

  abstract apply(
    ctx: GameContext,
    commit: () => GameContext,
    targetEventId?: string,
    targetTrafficCardId?: string,
    targetPeriod?: Period,
    targetTrack?: Track,
  ): GameContext;
}

export type Card = TrafficCard | EventCard | ActionCard;

// ─── Serialized card reference ────────────────────────────────────────────────

export interface SerializedCard {
  readonly templateId: string;
  readonly instanceId: string;
}

// ─── Serialized actor snapshot shapes (for save/load) ────────────────────────

export interface SerializedTrafficActorSnapshot {
  status: 'active';
  value: string;
  context: {
    instanceId: string;
    templateId: string;
    period?: string;
    slotIndex?: number;
    slotType?: string;
  };
}

export interface SerializedActionActorSnapshot {
  status: 'active';
  value: string;
  context: { instanceId: string; templateId: string };
}

export interface SerializedEventActorSnapshot {
  status: 'active';
  value: string;
  context: { instanceId: string; templateId: string; track?: string };
}

/** GameContext shape as stored in JSON — cards are represented as actor snapshots. */
export interface SerializedGameContext {
  budget: number;
  round: number;
  slaCount: number;
  /** Per-card position actor snapshots keyed by instanceId. */
  trafficActorSnapshots: Record<string, SerializedTrafficActorSnapshot>;
  actionActorSnapshots: Record<string, SerializedActionActorSnapshot>;
  eventActorSnapshots: Record<string, SerializedEventActorSnapshot>;
  /** Slot layout (structure only, no card refs). */
  slotLayout: Array<{ period: string; index: number; slotType: string }>;
  /** Ordered ticket instance IDs per track. */
  ticketOrders: Record<string, string[]>;
  /** Ordering arrays — IDs only. */
  trafficDeckOrder: string[];
  trafficDiscardOrder: string[];
  actionDeckOrder: string[];
  actionDiscardOrder: string[];
  eventDeckOrder: string[];
  eventDiscardOrder: string[];
  handOrder: string[];
  playedThisRoundOrder: string[];
  pendingEventsOrder: string[];
  spawnedQueueOrder: string[];
  vendorSlots: VendorSlot[];
  mitigatedEventIds: string[];
  activePhase: PhaseId;
  lastRoundSummary: RoundSummary | null;
  loseReason: LoseReason | null;
  pendingRevenue: number;
  seed: string;
  /** When true, the next round's traffic draw is skipped (AWS Outage carry-over effect). */
  skipNextTrafficDraw: boolean;
  /** Revenue multiplier applied to all traffic-card removals. Set by beneficial events; resets to 1 on Monday. */
  revenueBoostMultiplier: number;
  /** Number of SLA failures to forgive during this round's resolution phase. Consumed and reset to 0 by resolveRound. */
  slaForgivenessThisRound: number;

}

// ─── Board State ──────────────────────────────────────────────────────────────

/**
 * Describes the structural layout of a single time slot (whether it exists and what type it is).
 * Card occupancy is tracked by the traffic card actor's position state, not here.
 */
export interface TimeSlotLayout {
  readonly period: Period;
  readonly index: number;
  readonly slotType: SlotType;
}

/**
 * Derived view of a time slot that includes the occupying card, reconstructed
 * from TimeSlotLayout + actor state by getFilledTimeSlots().
 * Kept for backward compatibility with rendering code.
 */
export interface TimeSlot {
  readonly period: Period;
  readonly index: number;
  card: TrafficCard | null;
  readonly temporary?: boolean;
  readonly weeklyTemporary?: boolean;
  readonly overloaded?: boolean;
}

/** Derived view of a track row; reconstructed from ticketOrders + cardInstances. */
export interface TrackSlot {
  readonly track: Track;
  tickets: EventCard[];
}

// TODO-0003: implement vendor mechanics (Vendor card purchasing, slot bonuses, etc.)
export interface VendorSlot {
  readonly index: number;
  card: null; // Vendor cards excluded from MVP
}

// ─── Draw Log ─────────────────────────────────────────────────────────────────

/** One traffic card entry in the draw log — records where the card was placed. */
export interface DrawLogTrafficEntry {
  card: TrafficCard;
  period: Period;
  slotIndex: number;
}

/**
 * Runtime-only draw log. Populated by performDraw, performEnd, and performDrawCrisisEvent.
 * Not persisted in SerializedGameContext.
 */
export interface DrawLog {
  traffic: DrawLogTrafficEntry[];
  action: ActionCard[];
  events: EventCard[];
}

// ─── Game Context ─────────────────────────────────────────────────────────────

export interface GameContext {
  budget: number;
  round: number;
  slaCount: number;

  // ── Card instances (all cards ever created, keyed by instanceId) ────────────
  cardInstances: Record<string, Card>;

  // ── Per-card position actors (keyed by instanceId) ──────────────────────────
  trafficCardActors: TrafficCardActorRegistry;
  actionCardActors: ActionCardActorRegistry;
  eventCardActors: EventCardActorRegistry;

  // ── Slot layout (structure without card refs) ────────────────────────────────
  /** Ordered list of all time slots; slot presence / type is the source of truth here. */
  slotLayout: TimeSlotLayout[];

  // ── Ticket order per track ────────────────────────────────────────────────────
  /** Ordered instanceIds of event cards currently issued as tickets on each track. */
  ticketOrders: Record<Track, string[]>;

  // ── Ordering arrays (IDs only, insertion order = sequence) ───────────────────
  trafficDeckOrder: string[];
  trafficDiscardOrder: string[];
  actionDeckOrder: string[];
  actionDiscardOrder: string[];
  eventDeckOrder: string[];
  eventDiscardOrder: string[];
  /** IDs of action cards currently in the player's hand, in display order. */
  handOrder: string[];
  /** IDs of action cards played this round (pending discard at end). */
  playedThisRoundOrder: string[];
  /** IDs of event cards drawn this round, pending Crisis phase. */
  pendingEventsOrder: string[];
  /** IDs of traffic cards spawned by events, queued for board placement. */
  spawnedQueueOrder: string[];

  // ── Vendor placeholder slots ─────────────────────────────────────────────────
  /** TODO-0004: populate with vendor-mechanics effects once Vendor cards are implemented */
  vendorSlots: VendorSlot[];

  /** Action cards that successfully mitigated a DDoS event this round */
  mitigatedEventIds: string[];
  /** Current phase */
  activePhase: PhaseId;
  /** Round summary populated during Resolution phase */
  lastRoundSummary: RoundSummary | null;
  /** Cause of game loss */
  loseReason: LoseReason | null;
  /** Revenue collected by traffic card removals during the current round. */
  pendingRevenue: number;
  /** Seed used to derive per-round RNG — enables deterministic replays. */
  seed: string;
  /** When true, the next round's traffic draw is skipped (AWS Outage carry-over effect). */
  skipNextTrafficDraw: boolean;
  /** Revenue multiplier applied to all traffic-card removals. */
  revenueBoostMultiplier: number;
  /** Number of SLA failures to forgive during this round's resolution phase. Consumed and reset to 0 by resolveRound. */
  slaForgivenessThisRound: number;
  /** Animation draw log — runtime only, not persisted. */
  drawLog: DrawLog | null;
}

export interface RoundSummary {
  round: number;
  budgetDelta: number;
  newSlaCount: number;
  resolvedCount: number;
  failedCount: number;
  /** Number of SLA failures forgiven by Redundant Link (or similar) this round. */
  forgivenCount: number;
  /** Number of traffic cards placed on the board from SpawnTraffic events this round */
  spawnedTrafficCount: number;
}

export const STARTING_BUDGET = 500_000;
export const MAX_ROUNDS = 28;
export const BANKRUPT_THRESHOLD = -100_000;
export const MAX_SLA_FAILURES = 3;
export const HAND_SIZE = 7;
export const MIN_WEEKDAY_TRAFFIC_DRAW = 1;
export const MAX_WEEKDAY_TRAFFIC_DRAW = 6;
export const WEEKDAY_EVENT_DRAW = 1;
export const MIN_WEEKEND_TRAFFIC_DRAW = 1;
export const MAX_WEEKEND_TRAFFIC_DRAW = 2;
export const WEEKEND_EVENT_DRAW = 1;
export const DAYS_PER_WEEK = 7;
export const WORKDAYS_PER_WEEK = 5;
export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export const PERIOD_SLOT_COUNTS: Record<Period, number> = {
  [Period.Morning]: 4,
  [Period.Afternoon]: 4,
  [Period.Evening]: 4,
  [Period.Overnight]: 4,
};

// ─── Calendar Helpers ─────────────────────────────────────────────────────────

/** Day-of-week index (1 = Mon, 7 = Sun) for a given round number. */
export function getDayOfWeek(round: number): number {
  return ((round - 1) % DAYS_PER_WEEK) + 1;
}

/** Abbreviated day name ('Mon'–'Sun') for a given round number. */
export function getDayName(round: number): string {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return DAY_NAMES[(round - 1) % DAYS_PER_WEEK]!;
}

/** Week number (1-based) for a given round number. */
export function getWeekNumber(round: number): number {
  return Math.ceil(round / DAYS_PER_WEEK);
}

/** Whether the given round falls on a weekend (Saturday or Sunday). */
export function isWeekend(round: number): boolean {
  return getDayOfWeek(round) >= 6;
}

/** Whether the given round falls on a Friday (end of work week). */
export function isFriday(round: number): boolean {
  return getDayOfWeek(round) === 5;
}

// ─── Storage Adapter ─────────────────────────────────────────────────────────

/**
 * Platform-agnostic key-value storage contract.
 * Mirrors the subset of the Web Storage API used by save/load.
 * Implement this interface to provide storage for any platform
 * (browser localStorage, Node.js fs, Redis, in-memory, etc.).
 */
export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

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
  Execution = 'Execution',
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

export type DropZoneTarget = 'period' | 'slot' | 'occupied-slot' | 'track' | 'board';

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
 * Concrete subclasses may implement onPlace() for placement effects.
 */
export abstract class TrafficCard {
  abstract readonly templateId: string;
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly hoursRequired: number;
  abstract readonly revenue: number;
  abstract readonly description: string;
  readonly type = CardType.Traffic as const;

  /** Optional hook called when the card is placed into a slot. */
  onPlace?(ctx: GameContext, slotIndex: number): GameContext;
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
  readonly periodZoneVariant?: 'add' | 'remove';
  readonly crisisOnly?: boolean;
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

/** GameContext shape as stored in JSON — cards are { templateId, instanceId } pairs. */
export interface SerializedGameContext {
  budget: number;
  round: number;
  slaCount: number;
  hand: SerializedCard[];
  playedThisRound: SerializedCard[];
  timeSlots: Array<Omit<TimeSlot, 'cards'> & { cards: SerializedCard[] }>;
  tracks: Array<{ track: Track; tickets: SerializedCard[] }>;
  vendorSlots: VendorSlot[];
  pendingEvents: SerializedCard[];
  mitigatedEventIds: string[];
  activePhase: PhaseId;
  trafficDeck: SerializedCard[];
  trafficDiscard: SerializedCard[];
  eventDeck: SerializedCard[];
  eventDiscard: SerializedCard[];
  spawnedTrafficQueue: SerializedCard[];
  actionDeck: SerializedCard[];
  actionDiscard: SerializedCard[];
  lastRoundSummary: RoundSummary | null;
  loseReason: LoseReason | null;
  pendingOverloadCount: number;
  pendingRevenue: number;
  seed: string;
}

// ─── Board State ──────────────────────────────────────────────────────────────

export interface TimeSlot {
  readonly period: Period;
  readonly index: number;
  readonly baseCapacity: number;
  cards: TrafficCard[];
  /** True if this slot is unavailable due to Overload downtime */
  unavailable: boolean;
  /** True if this slot was added temporarily by a BoostSlotCapacity action card; stripped at every round reset */
  readonly temporary?: boolean;
  /** True if this slot was added by an AddPeriodSlots (Data Center Expansion) card; stripped on Monday */
  readonly weeklyTemporary?: boolean;
}

export interface TrackSlot {
  readonly track: Track;
  tickets: EventCard[];
}

// TODO-0003: implement vendor mechanics (Vendor card purchasing, slot bonuses, etc.)
export interface VendorSlot {
  readonly index: number;
  card: null; // Vendor cards excluded from MVP
}

// ─── Game Context ─────────────────────────────────────────────────────────────

export interface GameContext {
  budget: number;
  round: number;
  slaCount: number;
  /** Cards in the player's hand (Action cards only) */
  hand: ActionCard[];
  /** Cards played this round (for end-phase discard logic; Actions are NOT discarded, Traffic/Events are) */
  playedThisRound: ActionCard[];
  /** Time slots grouped by period */
  timeSlots: TimeSlot[];
  /** Track rows for tickets */
  tracks: TrackSlot[];
  /** Vendor placeholder slots — TODO-0004: populate with vendor-mechanics effects once Vendor cards are implemented */
  vendorSlots: VendorSlot[];
  /** Event cards drawn this round, pending Crisis phase */
  pendingEvents: EventCard[];
  /** Action cards that successfully mitigated a DDoS event this round */
  mitigatedEventIds: string[];
  /** Current phase */
  activePhase: PhaseId;
  /** Decks */
  trafficDeck: TrafficCard[];
  trafficDiscard: TrafficCard[];
  eventDeck: EventCard[];
  eventDiscard: EventCard[];
  /** Traffic cards queued by SpawnTraffic events during crisis; placed on the board in resolution */
  spawnedTrafficQueue: TrafficCard[];
  actionDeck: ActionCard[];
  actionDiscard: ActionCard[];
  /** Round summary populated during Resolution phase */
  lastRoundSummary: RoundSummary | null;
  /** Cause of game loss */
  loseReason: LoseReason | null;
  /** Number of overload events that occurred during the most recent fill phase.
   * Set by performDraw, consumed by resolveRound to populate RoundSummary.overloadPenalties,
   * then reset to 0. */
  pendingOverloadCount: number;
  /** Revenue collected by traffic card removals during the current round.
   * Set by playActionCard (RemoveTrafficCard), consumed by resolveRound to populate
   * RoundSummary.budgetDelta, then reset to 0. */
  pendingRevenue: number;
  /** Seed used to derive per-round RNG — enables deterministic replays. */
  seed: string;
}

export interface RoundSummary {
  round: number;
  budgetDelta: number;
  newSlaCount: number;
  resolvedCount: number;
  failedCount: number;
  overloadPenalties: number;
  /** Number of traffic cards placed on the board from SpawnTraffic events this round */
  spawnedTrafficCount: number;
}

export const STARTING_BUDGET = 500_000;
export const MAX_ROUNDS = 28;
export const BANKRUPT_THRESHOLD = -100_000;
export const MAX_SLA_FAILURES = 3;
export const HAND_SIZE = 7;
export const SLOT_BASE_CAPACITY = 1;
export const OVERLOAD_PENALTY = 25_000;
export const WEEKDAY_TRAFFIC_DRAW = 5;
export const WEEKDAY_EVENT_DRAW = 1;
export const WEEKEND_TRAFFIC_DRAW = 1;
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

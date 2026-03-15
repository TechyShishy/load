// TODO-0012: types.ts is growing large — consider splitting into domain-specific type files

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
}

/** Position data for a traffic card currently placed on the board. */
export interface TrafficSlotPosition {
  period: Period;
  slotIndex: number;
  slotType: SlotType;
}

export type DropZoneTarget = 'period' | 'slot' | 'occupied-slot' | 'track' | 'ticket' | 'board';

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
  readonly flavorText?: string;
  readonly type = CardType.Event as const;

  /**
   * Number of Work Order plays required to fully resolve this ticket.
   * Defaults to 1 (immediate clear). Override in ticket-issuing subclasses.
   */
  readonly requiredClears: number = 1;

  /**
   * Maximum revenue earned when this ticket is cleared on the same round it was issued.
   * Decays by revenueDecayPerRound for each subsequent round. Defaults to 0.
   */
  readonly clearRevenue: number = 0;

  /**
   * Amount deducted from clearRevenue for each round the ticket ages before being cleared.
   * Defaults to 0 (no decay).
   */
  readonly revenueDecayPerRound: number = 0;

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
  readonly flavorText?: string;
  readonly type = CardType.Traffic as const;

  /**
   * Week table — the period this card targets when drawn on each day of the week.
   * Index 0 = Monday … index 6 = Sunday.
   * Placement looks up `weekTable[getDayOfWeek(round) - 1]`.
   *
   * Cards without a meaningful week pattern (e.g. spawned-only cards) omit this
   * field. The placement algorithm falls back to Morning when it is absent.
   */
  readonly weekTable?: readonly [
    Period, Period, Period, Period, Period, Period, Period
  ];

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
  readonly flavorText?: string;
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

// ─── Contract types ───────────────────────────────────────────────────────────

/** One entry in a contract's deck spec — which template and how many copies. */
export interface DeckSpec {
  readonly templateId: string;
  readonly count: number;
}

/** Named scenario that defines network conditions for a game session. */
export interface ContractDef {
  /** Stable slug, e.g. 'standard'. Used as the contractId in GameContext. */
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly trafficDeck: DeckSpec[];
  readonly eventDeck: DeckSpec[];
  /** When set, overrides the default action-deck composition for this contract.
   * TODO-0015 resolved: merged into the deck builder system. */
  readonly actionDeck?: DeckSpec[];
  readonly startingBudget: number;
  readonly slaLimit: number;
  /** When set, this contract always uses this seed regardless of any caller-supplied
   * seed or URL override. Bump the suffix (e.g. v1 → v2) whenever deck composition
   * changes so returning players get a fresh sequence. */
  readonly fixedSeed?: string;
  /** Track ID passed to startMusic() when this contract is active in-game. Omit for silent contracts. */
  readonly musicTrackId?: string;
}

// ─── Serialized card reference ────────────────────────────────────────────────

export interface SerializedCard {
  readonly templateId: string;
  readonly instanceId: string;
}

/** GameContext shape as stored in JSON. */
export interface SerializedGameContext {
  budget: number;
  round: number;
  slaCount: number;
  /** Slug of the active contract, e.g. 'standard'. */
  contractId: string;
  /** Max SLA failures before game over — sourced from the active contract. */
  slaLimit: number;
  /** Maps every card instanceId → templateId for all cards created in this game session. */
  cardTemplateIds: Record<string, string>;
  /** Slot positions for traffic cards currently on the board, keyed by instanceId. */
  trafficSlotPositions: Record<string, { period: string; slotIndex: number; slotType: string }>;
  /** Slot layout (structure only, no card refs). */
  slotLayout: Array<{ period: string; index: number; slotType: string }>;
  /** Ordered ticket instance IDs per track. */
  ticketOrders: Record<string, string[]>;
  /** Work Order play count per in-progress ticket instanceId. */
  ticketProgress: Record<string, number>;
  /** Round number when each ticket was issued, keyed by instanceId. */
  ticketIssuedRound: Record<string, number>;
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
  /** Permanent registry of all ever-spawned traffic card IDs (not drawn from the deck). */
  spawnedTrafficIds: string[];
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
 * Card occupancy is tracked by trafficSlotPositions in GameContext, not here.
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
  /** Slug of the active contract, e.g. 'standard'. */
  contractId: string;
  /** Max SLA failures before game over — sourced from the active contract. */
  slaLimit: number;

  // ── Card instances (all cards ever created, keyed by instanceId) ────────────
  cardInstances: Record<string, Card>;

  // ── Traffic card slot positions (cards currently on the board) ───────────────
  /** Keyed by instanceId; entry exists iff the card is in a slot on the board. */
  trafficSlotPositions: Record<string, TrafficSlotPosition>;

  // ── Slot layout (structure without card refs) ────────────────────────────────
  /** Ordered list of all time slots; slot presence / type is the source of truth here. */
  slotLayout: TimeSlotLayout[];

  // ── Ticket order per track ────────────────────────────────────────────────────
  /** Ordered instanceIds of event cards currently issued as tickets on each track. */
  ticketOrders: Record<Track, string[]>;
  /**
   * Number of Work Order plays applied so far to each in-progress ticket,
   * keyed by the ticket's instanceId. Entries are removed when the ticket is fully cleared.
   */
  ticketProgress: Record<string, number>;
  /**
   * The round number when each ticket was issued, keyed by the ticket's instanceId.
   * Used to compute age-based clearRevenue decay. Entries are removed when cleared.
   */
  ticketIssuedRound: Record<string, number>;

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
  /**
   * Permanent registry of all traffic card IDs that were spawned (not drawn from the deck).
   * Spawned cards are removed from the board like normal cards but are NOT added to the
   * discard pile — they disappear entirely rather than cycling back through the deck.
   */
  spawnedTrafficIds: string[];

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
  /** Number of tickets that expired (clearRevenue hit $0) and auto-cleared this round, each costing 1 SLA. */
  expiredTicketCount: number;
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

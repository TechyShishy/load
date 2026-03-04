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

export enum EventSubtype {
  SpawnTraffic = 'SpawnTraffic',
  IssueTicket = 'IssueTicket',
  SpawnVendor = 'SpawnVendor',
}

export enum LoseReason {
  Bankrupt = 'Bankrupt',
  SLAExceeded = 'SLAExceeded',
}

// ─── Card Definitions ─────────────────────────────────────────────────────────

export interface TrafficCard {
  readonly id: string;
  readonly type: CardType.Traffic;
  readonly name: string;
  readonly hoursRequired: number;
  readonly revenue: number;
  readonly description: string;
}

export interface EventCard {
  readonly id: string;
  readonly type: CardType.Event;
  readonly name: string;
  readonly subtype: EventSubtype;
  /** Track to assign a ticket to (IssueTicket subtype only) */
  readonly targetTrack?: Track;
  /** Number of extra Traffic cards to spawn (SpawnTraffic subtype only) */
  readonly spawnCount?: number;
  /** Which traffic card template to spawn (SpawnTraffic subtype only) */
  readonly spawnTrafficId?: string;
  /** Financial penalty if not mitigated */
  readonly unmitigatedPenalty: number;
  /** Hours of downtime if not mitigated (removes slots from next period) */
  readonly downtimePenaltyHours: number;
  /** No-op this event during MVP when true (SpawnVendor) */
  readonly noOpMVP?: boolean;
  readonly description: string;
}

export interface ActionCard {
  readonly id: string;
  readonly type: CardType.Action;
  readonly name: string;
  readonly cost: number;
  readonly effectType: ActionEffectType;
  readonly effectValue: number;
  /** Track this action targets (for ticket-clearing actions) */
  readonly targetTrack?: Track;
  /** Period this action targets (for slot-modification actions) */
  readonly targetPeriod?: Period;
  /** Traffic card instance to remove (for RemoveTrafficCard actions) */
  readonly targetTrafficCardId?: string;
  readonly description: string;
}

export enum ActionEffectType {
  ClearTicket = 'ClearTicket',
  RemoveTrafficCard = 'RemoveTrafficCard',
  BoostSlotCapacity = 'BoostSlotCapacity',
  MitigateDDoS = 'MitigateDDoS',
  AddOvernightSlots = 'AddOvernightSlots',
}

export type Card = TrafficCard | EventCard | ActionCard;

// ─── Board State ──────────────────────────────────────────────────────────────

export interface TimeSlot {
  readonly period: Period;
  readonly index: number;
  readonly baseCapacity: number;
  cards: TrafficCard[];
  /** Temporary capacity boost from Action cards this round */
  capacityBoost: number;
  /** True if this slot is unavailable due to Overload downtime */
  unavailable: boolean;
}

export interface TrackSlot {
  readonly track: Track;
  tickets: EventCard[];
}

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
  /** Vendor placeholder slots */
  vendorSlots: VendorSlot[];
  /** Event cards drawn this round, pending Crisis phase */
  pendingEvents: EventCard[];
  /** Action cards that successfully mitigated a DDoS event this round */
  mitigatedEventIds: string[];
  /** Current phase */
  activePhase: PhaseId;
  /** Decks */
  trafficEventDeck: Array<TrafficCard | EventCard>;
  trafficEventDiscard: Array<TrafficCard | EventCard>;
  actionDeck: ActionCard[];
  actionDiscard: ActionCard[];
  /** Round summary populated during Resolution phase */
  lastRoundSummary: RoundSummary | null;
  /** Cause of game loss */
  loseReason: LoseReason | null;
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
}

export const STARTING_BUDGET = 500_000;
export const MAX_ROUNDS = 12;
export const BANKRUPT_THRESHOLD = -100_000;
export const MAX_SLA_FAILURES = 3;
export const HAND_SIZE = 7;
export const SLOT_BASE_CAPACITY = 3;
export const OVERLOAD_PENALTY = 25_000;
export const DRAW_COUNT = 5;
export const PERIOD_SLOT_COUNTS: Record<Period, number> = {
  [Period.Morning]: 4,
  [Period.Afternoon]: 4,
  [Period.Evening]: 4,
  [Period.Overnight]: 8,
};

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

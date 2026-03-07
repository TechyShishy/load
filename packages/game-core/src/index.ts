// ── Domain model (types & constants) ─────────────────────────────────────────
export {
  Period,
  Track,
  PhaseId,
  CardType,
  LoseReason,
  EventCard,
  TrafficCard,
  ActionCard,
  STARTING_BUDGET,
  MAX_ROUNDS,
  BANKRUPT_THRESHOLD,
  MAX_SLA_FAILURES,
  HAND_SIZE,
  MIN_WEEKDAY_TRAFFIC_DRAW,
  MAX_WEEKDAY_TRAFFIC_DRAW,
  WEEKDAY_EVENT_DRAW,
  MIN_WEEKEND_TRAFFIC_DRAW,
  MAX_WEEKEND_TRAFFIC_DRAW,
  WEEKEND_EVENT_DRAW,
  DAYS_PER_WEEK,
  WORKDAYS_PER_WEEK,
  DAY_NAMES,
  PERIOD_SLOT_COUNTS,
  getDayOfWeek,
  getDayName,
  getWeekNumber,
  isWeekend,
  isFriday,
} from './types.js';
export type {
  DropZoneTarget,
  Card,
  TimeSlot,
  TrackSlot,
  VendorSlot,
  GameContext,
  RoundSummary,
  DrawLog,
  DrawLogTrafficEntry,
  SerializedCard,
  SerializedGameContext,
  StorageAdapter,
} from './types.js';

// ── Persistence schema (for save/load validation) ─────────────────────────────
export { GameContextSchema } from './schemas.js';

// ── Serialization (dehydrate/hydrate) ─────────────────────────────────────────
export { dehydrateContext, hydrateContext } from './serialization.js';

// ── State machine (public façade) ─────────────────────────────────────────────
export { gameMachine, createInitialContext } from './machine.js';
export type { GameEvent } from './machine.js';

// ── Game content ──────────────────────────────────────────────────────────────
export {
  TRAFFIC_CARDS, TRAFFIC_CARD_REGISTRY,
  EVENT_CARDS, EVENT_CARD_REGISTRY,
  ACTION_CARDS, ACTION_CARD_REGISTRY,
} from './data/index.js';

// ── Deck constants ────────────────────────────────────────────────────────────
export { DEFAULT_ACTION_DECK, DEFAULT_TRAFFIC_DECK, DEFAULT_EVENT_DECK } from './deck.js';

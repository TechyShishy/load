// ── Domain model (types & constants) ─────────────────────────────────────────
export {
  Period,
  Track,
  PhaseId,
  CardType,
  EventSubtype,
  LoseReason,
  ActionEffectType,
  STARTING_BUDGET,
  MAX_ROUNDS,
  BANKRUPT_THRESHOLD,
  MAX_SLA_FAILURES,
  HAND_SIZE,
  SLOT_BASE_CAPACITY,
  OVERLOAD_PENALTY,
  WEEKDAY_TRAFFIC_DRAW,
  WEEKDAY_EVENT_DRAW,
  WEEKEND_TRAFFIC_DRAW,
  WEEKEND_EVENT_DRAW,
  DAYS_PER_WEEK,
  WORKDAYS_PER_WEEK,
  DAY_NAMES,
  WEEKEND_ALLOWED_EFFECTS,
  PERIOD_SLOT_COUNTS,
  getDayOfWeek,
  getDayName,
  getWeekNumber,
  isWeekend,
  isFriday,
} from './types.js';
export type {
  TrafficCard,
  EventCard,
  ActionCard,
  Card,
  TimeSlot,
  TrackSlot,
  VendorSlot,
  GameContext,
  RoundSummary,
  StorageAdapter,
} from './types.js';

// ── Persistence schema (for save/load validation) ─────────────────────────────
export { GameContextSchema } from './schemas.js';

// ── State machine (public façade) ─────────────────────────────────────────────
export { gameMachine, createInitialContext } from './machine.js';
export type { GameEvent } from './machine.js';

// ── Game content ──────────────────────────────────────────────────────────────
export { TRAFFIC_CARDS, EVENT_CARDS, ACTION_CARDS } from './data/index.js';

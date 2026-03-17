// ── Domain model (types & constants) ─────────────────────────────────────────
export {
  Period,
  Track,
  PhaseId,
  CardType,
  LoseReason,
  SlotType,
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
  DeckSpec,
  ContractDef,
  TimeSlot,
  TimeSlotLayout,
  TrackSlot,
  VendorSlot,
  GameContext,
  LedgerEntry,
  LedgerEntryKind,
  RoundSummary,
  DrawLog,
  DrawLogTrafficEntry,
  SerializedCard,
  SerializedGameContext,
  StorageAdapter,
  TrafficSlotPosition,
} from './types.js';

// ── Persistence schema (for save/load validation) ─────────────────────────────
export { GameContextSchema, DeckSpecSchema, DeckSpecArraySchema } from './schemas.js';

// ── Serialization (dehydrate/hydrate) ─────────────────────────────────────────
export { dehydrateContext, hydrateContext } from './serialization.js';

// ── State machine (public façade) ─────────────────────────────────────────────
export { gameMachine, createInitialContext } from './machine.js';
export type { GameEvent } from './machine.js';

// ── Game content ──────────────────────────────────────────────────────────────
export {
  TRAFFIC_CARDS, TRAFFIC_CARD_REGISTRY,
  EVENT_CARDS, EVENT_CARD_REGISTRY,
  ACTION_CARDS, ACTION_CARD_REGISTRY,  BUILT_IN_CONTRACTS, STANDARD_CONTRACT, LOCAL_ISP_CONTRACT,} from './data/index.js';

// ── Deck constants & utilities ───────────────────────────────────────────────
export { FALLBACK_ACTION_DECK, FALLBACK_TRAFFIC_DECK, FALLBACK_EVENT_DECK, MIN_DECK_SIZE, validateDeckSpec } from './deck.js';

// ── Card position view functions ──────────────────────────────────────────────
export {
  getTrafficDeck,
  getTrafficDiscard,
  getSpawnedTrafficQueue,
  getFilledTimeSlots,
  getActionDeck,
  getActionDiscard,
  getHand,
  getPlayedThisRound,
  getEventDeck,
  getEventDiscard,
  getPendingEvents,
  getTrackTickets,
  getTracks,
  getCardIdAtSlot,
} from './cardPositionViews.js';

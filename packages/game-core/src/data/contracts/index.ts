import {
  STARTING_BUDGET,
  MAX_SLA_FAILURES,
  type ContractDef,
} from '../../types.js';

/** Under DDoS Attack contract — today's hardcoded defaults wrapped in the ContractDef type.
 * These spec arrays deliberately duplicate DEFAULT_TRAFFIC_DECK / DEFAULT_EVENT_DECK
 * from deck.ts to avoid a circular import chain:
 *   contracts/index.ts → deck.ts → data/index.ts → contracts/index.ts
 */
export const STANDARD_CONTRACT: ContractDef = {
  id: 'standard',
  name: 'Under DDoS Attack',
  musicTrackId: 'contractTheme',
  description: 'Your network is under active DDoS bombardment. Manage legitimate traffic while Null-Routing the flood — every SLA failure costs you.',
  trafficDeck: [
    { templateId: 'traffic-4k-stream',    count: 6 },
    { templateId: 'traffic-iot-burst',    count: 5 },
    { templateId: 'traffic-cloud-backup', count: 5 },
    { templateId: 'traffic-ai-inference', count: 3 },
    { templateId: 'traffic-viral-spike',  count: 2 },
  ],
  eventDeck: [
    { templateId: 'event-ddos-attack',    count: 3 },
    { templateId: 'event-aws-outage',     count: 3 },
    { templateId: 'event-5g-activation',  count: 2 },
    { templateId: 'event-false-alarm',    count: 4 },
    { templateId: 'event-tier1-peering',  count: 2 },
  ],
  startingBudget: STARTING_BUDGET,
  slaLimit: MAX_SLA_FAILURES,
};

// TODO-0013 resolved: Local ISP contract is balanced as a fixed-seed tutorial.
/** Local ISP contract — reduced complexity intro scenario.
 *
 * DDoS attacks and Viral Spikes are removed to keep the first play-through
 * predictable. Most crisis draws are False Alarms; Tier-1 Peering rewards
 * good routing with frequent revenue boosts.
 *
 * fixedSeed: every play-through deals identical cards in identical order.
 * Bump the seed suffix (v1 → v2) if deck composition ever changes.
 *
 * actionDeck: Null Route is replaced with extra Work Orders. Null Route
 * is only useful against DDoS events, which do not appear in this contract —
 * keeping it in the hand would permanently block 3 of the player's 7 card slots.
 * Extra Work Orders pair with the 5G Activation ticket to teach the ticket loop.
 * TODO-0015: merge actionDeck into the Alpha deckbuilding system when that lands.
 */
export const LOCAL_ISP_CONTRACT: ContractDef = {
  id: 'local-isp',
  name: 'Local ISP',
  description: 'A small regional provider with predictable traffic and minimal outages. Learn the basics before stepping up.',
  musicTrackId: 'tutorialTheme',
  fixedSeed: 'local-isp-v1',
  trafficDeck: [
    { templateId: 'traffic-4k-stream',    count: 7 },
    { templateId: 'traffic-iot-burst',    count: 6 },
    { templateId: 'traffic-cloud-backup', count: 5 },
    { templateId: 'traffic-ai-inference', count: 3 },
    // Viral Spike excluded — more advanced card, reintroduced in Standard
  ],
  eventDeck: [
    // DDoS Attack excluded — SLA spawn mechanic introduced in Standard
    { templateId: 'event-aws-outage',    count: 1 },
    { templateId: 'event-5g-activation', count: 1 },
    { templateId: 'event-false-alarm',   count: 7 },
    { templateId: 'event-tier1-peering', count: 3 },
  ],
  // TODO-0015 resolved: actionDeck removed — DEFAULT_ACTION_DECK was updated to
  // match the tutorial composition (Work Order ×6, Null Route removed).
  startingBudget: 700_000,
  slaLimit: 5,
};

export const BUILT_IN_CONTRACTS: ContractDef[] = [
  LOCAL_ISP_CONTRACT,
  STANDARD_CONTRACT,
];

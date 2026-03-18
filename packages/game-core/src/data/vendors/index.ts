import { type VendorCard } from '../../types.js';

/**
 * Registry mapping templateId → constructor for deserialization. Populated by sub-issue D.
 * NOTE: every new VendorCard subclass must be registered in BOTH this Map AND
 * the VENDOR_CARDS array below. Omitting either causes the card to be either
 * playable-but-invisible-in-deck-builder (missing VENDOR_CARDS) or
 * visible-but-unserializable (missing VENDOR_CARD_REGISTRY).
 */
export const VENDOR_CARD_REGISTRY = new Map<string, new (instanceId: string) => VendorCard>();

/** Singleton template instances (id === templateId). Used by deck builder. Populated by sub-issue D. */
export const VENDOR_CARDS: VendorCard[] = [];

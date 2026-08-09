import type { RosterEntry } from '@/types/checkin';
import { DOUBLE_TICKET_PARTY, SINGLE_TICKET_PARTY, WAKWE_TICKET_PARTY } from './tickets';

/**
 * Derivations shared by every scanner screen.
 *
 * The roster comes back as one flat list, but a door attendant thinks in two
 * units at once: invitations (rows to tick off) and heads (people actually
 * walking in). Keeping both counts in one place stops the screens disagreeing
 * about what "12 arrived" means.
 */

/** Guests the couple never tagged, collected under one heading rather than
 *  each becoming a section of one. */
export const UNGROUPED_LABEL = 'Other guests';

/**
 * Letter-avatar palette. Deliberately muted and editorial rather than the
 * saturated defaults an avatar library ships: these sit next to guest names on
 * a cream surface all night. Every entry takes white text at 4.5:1 or better.
 */
const AVATAR_COLORS = [
  '#7E5896',
  '#2F7D74',
  '#9A5B7A',
  '#4A6FA5',
  '#8A6B1E',
  '#55703F',
] as const;

/**
 * Salutations and joining words that are not part of anybody's name.
 *
 * Couples enter guests the way an invitation is addressed, so "Mr & Mrs Boris
 * Massesa" is the normal shape of a row, not an edge case. Taking the first
 * and last word of that gives MM — every married couple on the list collapses
 * to the same two letters, which is exactly the case the avatar exists to tell
 * apart. Swahili titles are here because the roster is bilingual.
 */
const NAME_NOISE = new Set([
  'mr', 'mrs', 'ms', 'miss', 'mx', 'dr', 'prof', 'rev', 'sir', 'madam', 'chief',
  'eng', 'engr', 'capt', 'hon', 'mzee', 'bwana', 'bi', 'bibi', 'ndugu',
  'and', 'na', 'the', 'family',
]);

/** Is this word a real name part, rather than a title or a joining word? */
function isNamePart(word: string): boolean {
  const bare = initialCharOf(word) ? word.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase() : '';
  // Requires a letter, so "&", "+" and stray punctuation drop out too.
  return /\p{L}/u.test(bare) && !NAME_NOISE.has(bare);
}

/** First LETTER of a word, skipping punctuation a couple types around a
 *  nickname — "(Mhasibu)" initials as M, not "(". */
function initialCharOf(word: string): string {
  const letter = /\p{L}/u.exec(word);
  return letter ? letter[0] : '';
}

/**
 * First letter of the first and last real name parts — "Natasha Fernandes"
 * reads as NF, and "Mr & Mrs Boris Massesa" reads as BM rather than MM.
 *
 * Falls back to the raw words when a row is nothing but titles, because an
 * avatar showing "?" beside a name that is plainly on screen looks broken.
 */
export function initialsOf(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  const parts = words.filter(isNamePart);
  const usable = parts.length > 0 ? parts : words;
  if (usable.length === 0) return '?';
  const first = initialCharOf(usable[0]) || (usable[0][0] ?? '');
  const last =
    usable.length > 1
      ? initialCharOf(usable[usable.length - 1]) || (usable[usable.length - 1][0] ?? '')
      : '';
  return (first + last).toUpperCase();
}

/**
 * Stable colour for a key. Hashed rather than index-based so a guest keeps the
 * same colour when the list is filtered, sorted or re-fetched — an avatar that
 * changes hue between screens reads as a different person.
 */
export function avatarColorFor(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

/**
 * Clamp a confirmed arrival count to what the server will actually record.
 *
 * Mirrors the 1..party_size clamp in checkin_guest_invitation() and the amend
 * route. Every control that lets an attendant pick a headcount must offer
 * exactly this range — if the client accepted a number the server re-clamps,
 * the attendant would confirm one figure and the couple be billed another.
 */
export function clampArrived(count: number, partySize: number): number {
  const cap = Math.max(partySize, 1);
  return Math.min(Math.max(Math.trunc(count), 1), cap);
}

/** Heads expected: what everyone RSVP'd for. */
export function expectedHeads(guests: RosterEntry[]): number {
  return guests.reduce((sum, g) => sum + g.partySize, 0);
}

/** Heads actually through the door, counting only guests who have scanned in. */
export function arrivedHeads(guests: RosterEntry[]): number {
  return guests.reduce(
    (sum, g) => (g.checkedInAt ? sum + (g.checkedInPartySize ?? g.partySize) : sum),
    0
  );
}

export interface RosterGroup {
  /** The couple's own group tag, or {@link UNGROUPED_LABEL}. */
  tag: string;
  guests: RosterEntry[];
  /** Invitations already scanned in. */
  arrivedCount: number;
  /** People expected across the group. */
  heads: number;
}

/**
 * Split the roster by the couple's group tag, largest group first.
 *
 * Untagged guests always sort last regardless of size: they're a leftover
 * bucket, and floating them to the top of the group picker would bury the
 * named groups the couple actually set up.
 */
export function groupRoster(roster: RosterEntry[]): RosterGroup[] {
  const byTag = new Map<string, RosterEntry[]>();
  for (const guest of roster) {
    const tag = guest.groupTag?.trim() || UNGROUPED_LABEL;
    const existing = byTag.get(tag);
    if (existing) existing.push(guest);
    else byTag.set(tag, [guest]);
  }

  return [...byTag.entries()]
    .map(([tag, guests]) => ({
      tag,
      guests,
      arrivedCount: guests.filter((g) => g.checkedInAt).length,
      heads: expectedHeads(guests),
    }))
    .sort((a, b) => {
      if (a.tag === UNGROUPED_LABEL) return 1;
      if (b.tag === UNGROUPED_LABEL) return -1;
      return b.guests.length - a.guests.length || a.tag.localeCompare(b.tag);
    });
}

/** "12 guests · 28 people" — rows and heads together, the way the door counts. */
export function countLabel(guestCount: number, heads: number): string {
  const rows = `${guestCount} ${guestCount === 1 ? 'guest' : 'guests'}`;
  return heads === guestCount ? rows : `${rows} · ${heads} people`;
}

/**
 * Badge text for a party size, in the language the tickets are sold in:
 * passes come as Single, Double or Wakwe, so those words are what the guest is
 * holding and what the attendant should read. Other counts (special
 * invitations the couple entered by hand) fall back to the count.
 *
 * Exact match, not a floor: at the door a count between two sold sizes must
 * not be named after the smaller ticket. Mirrors ticketLabel in
 * opus_admin/src/lib/checkin-report.ts.
 */
export function partySizeLabel(partySize: number): string {
  if (partySize === SINGLE_TICKET_PARTY) return 'Single';
  if (partySize === DOUBLE_TICKET_PARTY) return 'Double';
  // Wakwe: the in-laws' ten-on-one-QR ticket.
  if (partySize === WAKWE_TICKET_PARTY) return 'Wakwe';
  return `Party of ${partySize}`;
}

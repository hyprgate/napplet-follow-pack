import type { NostrEvent } from '@hyprgate/types';
import { KIND_CONTACTS, KIND_FOLLOW_PACK } from '@hyprgate/types';

const HEX_PUBKEY = /^[0-9a-f]{64}$/i;

export interface FollowPack {
  id: string;
  author: string;
  dTag: string;
  title: string;
  description: string;
  image: string | null;
  pubkeys: string[];
  createdAt: number;
}

export interface FollowPackSummary extends FollowPack {
  totalCount: number;
  newCount: number;
}

export interface ContactListTemplate {
  kind: typeof KIND_CONTACTS;
  content: '';
  tags: string[][];
  created_at: number;
}

function tagValue(event: Pick<NostrEvent, 'tags'>, name: string): string | null {
  const value = tagsFor(event).find((tag) => tag[0] === name)?.[1]?.trim();
  return value ? value : null;
}

function tagsFor(event: Pick<NostrEvent, 'tags'> | null | undefined): string[][] {
  return Array.isArray(event?.tags) ? event.tags : [];
}

function validPubkey(value: string | undefined): value is string {
  return typeof value === 'string' && HEX_PUBKEY.test(value);
}

export function isValidPubkey(value: string): boolean {
  return validPubkey(value);
}

export function parseFollowPackEvent(event: NostrEvent): FollowPack | null {
  if (event.kind !== KIND_FOLLOW_PACK) return null;

  const dTag = tagValue(event, 'd') ?? event.id;
  const pubkeys = [...new Set(tagsFor(event)
    .filter((tag) => tag[0] === 'p' && validPubkey(tag[1]))
    .map((tag) => tag[1]!.toLowerCase()))];

  if (pubkeys.length === 0) return null;

  return {
    id: event.id,
    author: event.pubkey,
    dTag,
    title: tagValue(event, 'title') ?? dTag,
    description: tagValue(event, 'description') ?? '',
    image: tagValue(event, 'image'),
    pubkeys,
    createdAt: event.created_at,
  };
}

export function summarizePack(
  pack: FollowPack,
  followedPubkeys: Iterable<string>,
  self: string | null = null,
): FollowPackSummary {
  return {
    ...pack,
    totalCount: pack.pubkeys.length,
    newCount: newPubkeysFromPack(pack, followedPubkeys, self).length,
  };
}

export function upsertPacks(packs: FollowPack[], incoming: FollowPack): FollowPack[] {
  const byAddress = new Map<string, FollowPack>();
  for (const pack of packs) byAddress.set(`${pack.author}:${pack.dTag}`, pack);
  const key = `${incoming.author}:${incoming.dTag}`;
  const existing = byAddress.get(key);
  if (!existing || incoming.createdAt >= existing.createdAt) {
    byAddress.set(key, incoming);
  }
  return [...byAddress.values()].sort((a, b) => b.createdAt - a.createdAt || a.title.localeCompare(b.title));
}

/** Who "Follow all" would add. You're never one of them, even if a pack lists you. */
export function newPubkeysFromPack(
  pack: FollowPack,
  followedPubkeys: Iterable<string>,
  self: string | null = null,
): string[] {
  const follows = new Set([...followedPubkeys].map((pubkey) => pubkey.toLowerCase()));
  const me = self?.toLowerCase();
  return pack.pubkeys.filter((pubkey) => !follows.has(pubkey) && pubkey !== me);
}

/** The follow button's words, and how a whole pack reads on a card. */
export function packProgress(summary: Pick<FollowPackSummary, 'totalCount' | 'newCount'>): string {
  const people = `${summary.totalCount} ${summary.totalCount === 1 ? 'person' : 'people'}`;
  if (summary.newCount === 0) return people;
  return `${people}, ${summary.newCount} you don't follow yet`;
}

export function followAllLabel(summary: Pick<FollowPackSummary, 'totalCount' | 'newCount'>): string {
  return summary.newCount === summary.totalCount ? `Follow all ${summary.totalCount}` : `Follow ${summary.newCount} more`;
}

export function createContactListTemplate(
  existingContactList: NostrEvent | null,
  knownFollows: Iterable<string>,
  pubkeysToAdd: Iterable<string>,
  now = Math.floor(Date.now() / 1000),
): ContactListTemplate {
  const existingTags = tagsFor(existingContactList).filter((tag) => tag[0] === 'p' && validPubkey(tag[1]));
  const tags = existingTags.map((tag) => [...tag]);

  const seen = new Set(tags.map((tag) => tag[1]!.toLowerCase()));
  for (const pubkey of knownFollows) {
    const normalized = pubkey.toLowerCase();
    if (!validPubkey(normalized) || seen.has(normalized)) continue;
    tags.push(['p', normalized]);
    seen.add(normalized);
  }

  for (const pubkey of pubkeysToAdd) {
    const normalized = pubkey.toLowerCase();
    if (!validPubkey(normalized) || seen.has(normalized)) continue;
    tags.push(['p', normalized]);
    seen.add(normalized);
  }

  return {
    kind: KIND_CONTACTS,
    content: '',
    tags,
    created_at: now,
  };
}

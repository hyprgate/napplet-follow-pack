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
  const value = event.tags.find((tag) => tag[0] === name)?.[1]?.trim();
  return value ? value : null;
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
  const pubkeys = [...new Set(event.tags
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

export function summarizePack(pack: FollowPack, followedPubkeys: Iterable<string>): FollowPackSummary {
  const follows = new Set([...followedPubkeys].map((pubkey) => pubkey.toLowerCase()));
  return {
    ...pack,
    totalCount: pack.pubkeys.length,
    newCount: pack.pubkeys.filter((pubkey) => !follows.has(pubkey)).length,
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

export function newPubkeysFromPack(pack: FollowPack, followedPubkeys: Iterable<string>): string[] {
  const follows = new Set([...followedPubkeys].map((pubkey) => pubkey.toLowerCase()));
  return pack.pubkeys.filter((pubkey) => !follows.has(pubkey));
}

export function createContactListTemplate(
  existingContactList: NostrEvent | null,
  knownFollows: Iterable<string>,
  pubkeysToAdd: Iterable<string>,
  now = Math.floor(Date.now() / 1000),
): ContactListTemplate {
  const existingTags = existingContactList?.tags.filter((tag) => tag[0] === 'p' && validPubkey(tag[1])) ?? [];
  const tags = existingTags.length > 0
    ? existingTags.map((tag) => [...tag])
    : [...new Set([...knownFollows].filter(validPubkey).map((pubkey) => pubkey.toLowerCase()))].map((pubkey) => ['p', pubkey]);

  const seen = new Set(tags.map((tag) => tag[1]!.toLowerCase()));
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

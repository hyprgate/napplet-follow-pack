import { describe, expect, it } from 'vitest';
import type { NostrEvent } from '@hyprgate/types';
import { KIND_CONTACTS, KIND_FOLLOW_PACK } from '@hyprgate/types';
import {
  createContactListTemplate,
  newPubkeysFromPack,
  parseFollowPackEvent,
  summarizePack,
  upsertPacks,
} from './follow-pack.js';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);
const D = 'd'.repeat(64);

function event(overrides: Partial<NostrEvent> = {}): NostrEvent {
  return {
    id: 'e'.repeat(64),
    pubkey: A,
    created_at: 100,
    kind: KIND_FOLLOW_PACK,
    tags: [
      ['d', 'nostr-builders'],
      ['title', 'Nostr Builders'],
      ['description', 'People building clients and tools'],
      ['image', 'https://example.test/cover.png'],
      ['p', B],
      ['p', C, 'wss://relay.example'],
      ['p', B],
      ['p', 'not-a-pubkey'],
    ],
    content: '',
    sig: 'f'.repeat(128),
    ...overrides,
  };
}

describe('follow pack parsing', () => {
  it('parses NIP-51 starter-pack tags and dedupes p tags', () => {
    expect(parseFollowPackEvent(event())).toMatchObject({
      id: 'e'.repeat(64),
      author: A,
      dTag: 'nostr-builders',
      title: 'Nostr Builders',
      description: 'People building clients and tools',
      image: 'https://example.test/cover.png',
      pubkeys: [B, C],
      createdAt: 100,
    });
  });

  it('rejects empty packs and non-starter-pack events', () => {
    expect(parseFollowPackEvent(event({ kind: 1 }))).toBeNull();
    expect(parseFollowPackEvent(event({ tags: [['d', 'empty']] }))).toBeNull();
  });

  it('computes new follows against the current contact set', () => {
    const pack = parseFollowPackEvent(event())!;
    expect(summarizePack(pack, [B])).toMatchObject({ totalCount: 2, newCount: 1 });
    expect(newPubkeysFromPack(pack, [B])).toEqual([C]);
  });

  it('keeps the newest pack for an author/d tag pair', () => {
    const oldPack = parseFollowPackEvent(event({ id: '1'.repeat(64), created_at: 10 }))!;
    const newPack = parseFollowPackEvent(event({ id: '2'.repeat(64), created_at: 20, tags: [['d', 'nostr-builders'], ['title', 'New'], ['p', D]] }))!;
    expect(upsertPacks([oldPack], newPack)).toEqual([newPack]);
    expect(upsertPacks([newPack], oldPack)).toEqual([newPack]);
  });
});

describe('contact-list publishing template', () => {
  it('preserves existing p tags and appends only new pubkeys', () => {
    const existing = event({
      kind: KIND_CONTACTS,
      tags: [
        ['p', B, 'wss://b.example', 'bee'],
        ['p', C],
      ],
    });

    expect(createContactListTemplate(existing, [], [B, D], 123)).toEqual({
      kind: KIND_CONTACTS,
      content: '',
      tags: [
        ['p', B, 'wss://b.example', 'bee'],
        ['p', C],
        ['p', D],
      ],
      created_at: 123,
    });
  });

  it('builds from identity follows when no raw contact list is available', () => {
    expect(createContactListTemplate(null, [B], [C], 123).tags).toEqual([
      ['p', B],
      ['p', C],
    ]);
  });

  it('falls back to identity follows when a contact-list result has no tags array', () => {
    const malformed = event({
      kind: KIND_CONTACTS,
      tags: undefined as unknown as string[][],
    });

    expect(createContactListTemplate(malformed, [B], [C], 123).tags).toEqual([
      ['p', B],
      ['p', C],
    ]);
  });
});

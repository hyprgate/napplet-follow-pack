import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NostrEvent } from '@hyprgate/types';
import { KIND_CONTACTS, KIND_FOLLOW_PACK } from '@hyprgate/types';
import { createFollowPackStore } from './follow-pack-store.js';

const SELF = '1'.repeat(64);
const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);

const relaySubscribe = vi.hoisted(() => vi.fn());
const relayQuery = vi.hoisted(() => vi.fn());
const relayPublish = vi.hoisted(() => vi.fn());
const outboxSubscribe = vi.hoisted(() => vi.fn());
const identityGetPublicKey = vi.hoisted(() => vi.fn());
const identityGetFollows = vi.hoisted(() => vi.fn());

vi.mock('@napplet/sdk', () => ({
  identity: {
    getPublicKey: identityGetPublicKey,
    getFollows: identityGetFollows,
  },
  outbox: {
    subscribe: outboxSubscribe,
  },
  relay: {
    subscribe: relaySubscribe,
    query: relayQuery,
    publish: relayPublish,
  },
}));

function installShell(supportsOutbox = true): void {
  (globalThis as unknown as { napplet: unknown }).napplet = {
    shell: {
      ready: vi.fn().mockResolvedValue({}),
      supports: vi.fn((domain: string) => domain === 'outbox' && supportsOutbox),
    },
  };
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function event(overrides: Partial<NostrEvent> = {}): NostrEvent {
  return {
    id: 'e'.repeat(64),
    pubkey: A,
    created_at: 100,
    kind: KIND_FOLLOW_PACK,
    tags: [
      ['d', 'pack'],
      ['title', 'Pack'],
      ['p', B],
      ['p', C],
    ],
    content: '',
    sig: 'f'.repeat(128),
    ...overrides,
  };
}

describe('createFollowPackStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installShell(true);
    identityGetPublicKey.mockResolvedValue(SELF);
    identityGetFollows.mockResolvedValue([B]);
    relaySubscribe.mockImplementation((_filters, _onEvent, onEose) => {
      onEose();
      return { close: vi.fn() };
    });
    outboxSubscribe.mockReturnValue({
      on: vi.fn(),
      close: vi.fn(),
    });
    relayQuery.mockResolvedValue([]);
    relayPublish.mockResolvedValue({});
  });

  it('passes an array of filters to outbox subscribe so the SDK shim can normalize it', async () => {
    const store = createFollowPackStore();
    store.load();
    await flush();

    expect(outboxSubscribe).toHaveBeenCalledWith(
      [{ kinds: [KIND_FOLLOW_PACK], limit: 120 }],
      { strategy: 'outbox', live: true },
    );
  });

  it('does not crash when identity.getFollows fails', async () => {
    identityGetFollows.mockRejectedValueOnce(new Error('follows unavailable'));
    const onUpdate = vi.fn();
    const store = createFollowPackStore(onUpdate);

    store.load();
    await flush();

    expect(store.state.error).toBeNull();
    expect(store.state.followedPubkeys).toEqual(new Set());
    expect(onUpdate).toHaveBeenCalled();
  });

  it('followPack publishes only not-yet-followed profiles and updates visible state', async () => {
    const store = createFollowPackStore();
    store.load();
    await flush();
    const pack = {
      id: 'pack',
      author: A,
      dTag: 'pack',
      title: 'Pack',
      description: '',
      image: null,
      pubkeys: [B, C],
      createdAt: 100,
      totalCount: 2,
      newCount: 1,
    };

    await store.followPack(pack);

    expect(relayPublish).toHaveBeenCalledWith(expect.objectContaining({
      kind: KIND_CONTACTS,
      tags: [['p', B], ['p', C]],
    }));
    expect(store.state.followedPubkeys.has(C)).toBe(true);
    expect(store.state.status).toBe('Followed 1 profile.');
  });

  it('ingests malformed and empty pack events without throwing', async () => {
    let onEvent: ((event: NostrEvent) => void) | null = null;
    relaySubscribe.mockImplementation((_filters, next, onEose) => {
      onEvent = next;
      onEose();
      return { close: vi.fn() };
    });
    const store = createFollowPackStore();

    store.load();
    await flush();
    expect(() => onEvent?.(event({ tags: undefined as unknown as string[][] }))).not.toThrow();
    expect(() => onEvent?.(event({ tags: [['d', 'empty']] }))).not.toThrow();
    expect(store.state.packs).toEqual([]);
  });
});

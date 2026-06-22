import { identity, outbox, relay, type Subscription } from '@napplet/sdk';
import type { NostrEvent, NostrFilter } from '@hyprgate/types';
import { KIND_CONTACTS, KIND_FOLLOW_PACK } from '@hyprgate/types';
import {
  createContactListTemplate,
  newPubkeysFromPack,
  parseFollowPackEvent,
  summarizePack,
  upsertPacks,
  type FollowPack,
  type FollowPackSummary,
} from './follow-pack.js';

interface NappletShellHandle {
  ready(): Promise<unknown>;
  supports(domain: string, protocol?: string): boolean;
}

function getShell(): NappletShellHandle | null {
  return (globalThis as unknown as { napplet?: { shell?: NappletShellHandle } }).napplet?.shell ?? null;
}

export interface FollowPackState {
  packs: FollowPackSummary[];
  selectedId: string | null;
  followedPubkeys: Set<string>;
  loading: boolean;
  publishing: boolean;
  error: string | null;
  status: string | null;
}

export interface FollowPackStore {
  state: FollowPackState;
  load(): void;
  select(id: string): void;
  followPack(pack: FollowPack): Promise<void>;
  followPubkey(pubkey: string): Promise<void>;
  destroy(): void;
}

interface FollowPackContext {
  rawPacks: FollowPack[];
  state: FollowPackState;
  subs: Subscription[];
  pendingEose: number;
  self: string | null;
  notify(): void;
}

export function createInitialFollowPackState(): FollowPackState {
  return {
    packs: [],
    selectedId: null,
    followedPubkeys: new Set(),
    loading: false,
    publishing: false,
    error: null,
    status: null,
  };
}

function rebuild(ctx: FollowPackContext): void {
  ctx.state.packs = ctx.rawPacks.map((pack) => summarizePack(pack, ctx.state.followedPubkeys));
  if (!ctx.state.selectedId || !ctx.state.packs.some((pack) => pack.id === ctx.state.selectedId)) {
    ctx.state.selectedId = ctx.state.packs[0]?.id ?? null;
  }
}

function destroy(ctx: FollowPackContext): void {
  for (const sub of ctx.subs.splice(0)) sub.close();
  ctx.pendingEose = 0;
}

function handlePackEvent(ctx: FollowPackContext, event: NostrEvent): void {
  const pack = parseFollowPackEvent(event);
  if (!pack) return;
  ctx.rawPacks = upsertPacks(ctx.rawPacks, pack);
  rebuild(ctx);
  ctx.notify();
}

function finishEose(ctx: FollowPackContext): void {
  ctx.pendingEose = Math.max(0, ctx.pendingEose - 1);
  if (ctx.pendingEose === 0) {
    ctx.state.loading = false;
  }
  rebuild(ctx);
  ctx.notify();
}

function subscribeRelay(ctx: FollowPackContext, filter: NostrFilter): void {
  ctx.pendingEose += 1;
  const sub = relay.subscribe(
    filter,
    (event) => handlePackEvent(ctx, event as NostrEvent),
    () => finishEose(ctx),
  );
  ctx.subs.push(sub);
}

function subscribeOutbox(ctx: FollowPackContext, filter: NostrFilter): void {
  ctx.pendingEose += 1;
  const sub = outbox.subscribe([filter], { strategy: 'outbox', live: true });
  sub.on('event', (event) => handlePackEvent(ctx, event as NostrEvent));
  sub.on('eose', () => finishEose(ctx));
  ctx.subs.push({ close: () => sub.close() });
}

async function load(ctx: FollowPackContext): Promise<void> {
  destroy(ctx);
  ctx.rawPacks = [];
  ctx.self = null;
  ctx.state.loading = true;
  ctx.state.error = null;
  ctx.state.status = null;
  ctx.state.selectedId = null;
  rebuild(ctx);
  ctx.notify();

  try {
    const [self, follows] = await Promise.all([
      identity.getPublicKey(),
      identity.getFollows().catch(() => []),
    ]);
    ctx.self = self;
    ctx.state.followedPubkeys = new Set(follows.map((pubkey) => pubkey.toLowerCase()));
    rebuild(ctx);
    ctx.notify();

    const shell = getShell();
    await shell?.ready();

    const filter: NostrFilter = { kinds: [KIND_FOLLOW_PACK], limit: 120 };
    subscribeRelay(ctx, filter);
    if (shell?.supports('outbox') ?? false) {
      subscribeOutbox(ctx, filter);
    }
  } catch (error) {
    ctx.state.loading = false;
    ctx.state.error = error instanceof Error ? error.message : 'Unable to load follow packs.';
    ctx.notify();
  }
}

async function latestContactList(pubkey: string): Promise<NostrEvent | null> {
  const events = await relay.query([{ kinds: [KIND_CONTACTS], authors: [pubkey], limit: 1 }]);
  return (events as NostrEvent[])
    .filter((event) => event.kind === KIND_CONTACTS && event.pubkey === pubkey)
    .sort((a, b) => b.created_at - a.created_at)[0] ?? null;
}

async function followPubkeys(ctx: FollowPackContext, pubkeys: string[]): Promise<void> {
  if (!ctx.self) {
    ctx.state.error = 'Connect an identity before following profiles.';
    ctx.notify();
    return;
  }

  const toAdd = pubkeys.filter((pubkey) => !ctx.state.followedPubkeys.has(pubkey.toLowerCase()));
  if (toAdd.length === 0) {
    ctx.state.status = 'Already following everyone selected.';
    ctx.notify();
    return;
  }

  ctx.state.publishing = true;
  ctx.state.error = null;
  ctx.state.status = null;
  ctx.notify();

  try {
    const existing = await latestContactList(ctx.self);
    const template = createContactListTemplate(existing, ctx.state.followedPubkeys, toAdd);
    await relay.publish(template);
    ctx.state.followedPubkeys = new Set([...ctx.state.followedPubkeys, ...toAdd.map((pubkey) => pubkey.toLowerCase())]);
    ctx.state.status = `Followed ${toAdd.length} profile${toAdd.length === 1 ? '' : 's'}.`;
  } catch (error) {
    ctx.state.error = error instanceof Error ? error.message : 'Unable to publish follow list.';
  } finally {
    ctx.state.publishing = false;
    rebuild(ctx);
    ctx.notify();
  }
}

export function createFollowPackStore(onUpdate?: () => void): FollowPackStore {
  const ctx: FollowPackContext = {
    rawPacks: [],
    state: createInitialFollowPackState(),
    subs: [],
    pendingEose: 0,
    self: null,
    notify: () => onUpdate?.(),
  };

  return {
    state: ctx.state,
    load: () => { void load(ctx); },
    select(id: string): void {
      ctx.state.selectedId = id;
      ctx.notify();
    },
    followPack(pack: FollowPack): Promise<void> {
      return followPubkeys(ctx, newPubkeysFromPack(pack, ctx.state.followedPubkeys));
    },
    followPubkey(pubkey: string): Promise<void> {
      return followPubkeys(ctx, [pubkey]);
    },
    destroy: () => destroy(ctx),
  };
}

export function selectedPack(state: FollowPackState): FollowPackSummary | null {
  return state.packs.find((pack) => pack.id === state.selectedId) ?? state.packs[0] ?? null;
}
